import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";

type CloudinaryAsset = {
  secure_url?: string;
  url?: string;
  resource_type?: string;
};

type CloudinaryWidgetResult = {
  event?: string;
  info?: CloudinaryAsset;
};

type CloudinaryMediaLibraryResult = {
  assets?: CloudinaryAsset[];
};

type CloudinaryWidgetApi = {
  openMediaLibrary?: (
    options: Record<string, unknown>,
    handlers: { insertHandler: (data: CloudinaryMediaLibraryResult) => void },
  ) => unknown;
  createMediaLibrary?: (
    options: Record<string, unknown>,
    handlers: { insertHandler: (data: CloudinaryMediaLibraryResult) => void },
  ) => { show?: () => void };
  openUploadWidget?: (
    options: Record<string, unknown>,
    callback: (error: unknown, result?: CloudinaryWidgetResult) => void,
  ) => unknown;
  createUploadWidget?: (
    options: Record<string, unknown>,
    callback: (error: unknown, result?: CloudinaryWidgetResult) => void,
  ) => { open?: () => void };
};

declare global {
  interface Window {
    cloudinary?: CloudinaryWidgetApi;
  }
}

export type CloudinaryMediaPickerHandle = {
  openGallery: () => void;
  openUpload: () => void;
};

type Props = {
  onSelect: (url: string) => void;
  compact?: boolean;
  label?: string;
  helperText?: string;
};

let mediaLibraryPromise: Promise<void> | null = null;
let uploadWidgetPromise: Promise<void> | null = null;

function cloudinaryEnv(name: string) {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
  return String(env[name] || "").trim();
}

function loadScript(src: string, id: string) {
  if (typeof document === "undefined") return Promise.resolve();

  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") return Promise.resolve();

  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Cloudinary widget script could not be loaded")), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Cloudinary widget script could not be loaded"));
    document.head.appendChild(script);
  });
}

function loadMediaLibrary() {
  if (!mediaLibraryPromise) {
    mediaLibraryPromise = loadScript(
      "https://media-library.cloudinary.com/global/all.js",
      "cloudinary-media-library-script",
    );
  }
  return mediaLibraryPromise;
}

function loadUploadWidget() {
  if (!uploadWidgetPromise) {
    uploadWidgetPromise = loadScript(
      "https://upload-widget.cloudinary.com/latest/global/all.js",
      "cloudinary-upload-widget-script",
    );
  }
  return uploadWidgetPromise;
}

function getAssetUrl(asset?: CloudinaryAsset | null) {
  const url = String(asset?.secure_url || asset?.url || "").trim();
  if (!url || asset?.resource_type && asset.resource_type !== "image") return null;
  return url;
}

const CloudinaryMediaPicker = forwardRef<CloudinaryMediaPickerHandle, Props>(function CloudinaryMediaPicker(
  { onSelect, compact = false, label = "Cloudinary Gallery", helperText },
  ref,
) {
  const [busy, setBusy] = useState<"gallery" | "upload" | null>(null);
  const [error, setError] = useState("");
  const uploadWidgetRef = useRef<{ open?: () => void } | null>(null);

  const cloudName = cloudinaryEnv("VITE_CLOUDINARY_CLOUD_NAME");
  const uploadPreset = cloudinaryEnv("VITE_CLOUDINARY_UPLOAD_PRESET");
  const apiKey = cloudinaryEnv("VITE_CLOUDINARY_API_KEY");

  const selectAsset = useCallback((asset?: CloudinaryAsset | null) => {
    const url = getAssetUrl(asset);
    if (!url) {
      setError("শুধু Cloudinary-এর image asset বেছে নিন");
      return;
    }
    setError("");
    onSelect(url);
  }, [onSelect]);

  const openGallery = useCallback(async () => {
    setError("");
    if (!cloudName) {
      setError("Cloudinary cloud name সেট করা হয়নি");
      return;
    }

    setBusy("gallery");
    try {
      await loadMediaLibrary();
      const cloudinary = window.cloudinary;
      if (!cloudinary?.openMediaLibrary && !cloudinary?.createMediaLibrary) {
        throw new Error("Cloudinary Media Library চালু করা যায়নি");
      }

      const options: Record<string, unknown> = {
        cloud_name: cloudName,
        multiple: false,
        max_files: 1,
        default_transformations: [
          [{ quality: "auto" }, { fetch_format: "auto" }],
          [{ width: 96, height: 96, crop: "fill", gravity: "auto" }, { fetch_format: "auto" }],
        ],
      };
      if (apiKey) options.api_key = apiKey;

      const handlers = {
        insertHandler: (data: CloudinaryMediaLibraryResult) => {
          const asset = Array.isArray(data?.assets) ? data.assets.find((item) => item?.resource_type !== "video") : null;
          selectAsset(asset);
          setBusy(null);
        },
      };

      if (cloudinary.openMediaLibrary) {
        cloudinary.openMediaLibrary(options, handlers);
      } else {
        const widget = cloudinary.createMediaLibrary!(options, handlers);
        widget?.show?.();
      }
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "Cloudinary Gallery খোলা যায়নি");
    }
  }, [apiKey, cloudName, selectAsset]);

  const openUpload = useCallback(async () => {
    setError("");
    if (!cloudName || !uploadPreset) {
      setError("Cloudinary cloud name ও unsigned upload preset সেট করা হয়নি");
      return;
    }

    setBusy("upload");
    try {
      await loadUploadWidget();
      const cloudinary = window.cloudinary;
      if (!cloudinary?.openUploadWidget && !cloudinary?.createUploadWidget) {
        throw new Error("Cloudinary Upload Widget চালু করা যায়নি");
      }

      const options: Record<string, unknown> = {
        cloudName,
        uploadPreset,
        multiple: false,
        maxFiles: 1,
        sources: ["local"],
        folder: "news",
        resourceType: "image",
        clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
        maxImageFileSize: 10000000,
      };

      const callback = (errorValue: unknown, result?: CloudinaryWidgetResult) => {
        if (errorValue) {
          setBusy(null);
          setError(typeof errorValue === "string" ? errorValue : "Cloudinary-তে ছবি আপলোড করা যায়নি");
          return;
        }
        if (result?.event === "success") {
          selectAsset(result.info);
          setBusy(null);
        } else if (result?.event === "close") {
          setBusy(null);
        }
      };

      if (cloudinary.openUploadWidget) {
        cloudinary.openUploadWidget(options, callback);
      } else {
        const widget = cloudinary.createUploadWidget!(options, callback);
        uploadWidgetRef.current = widget;
        widget?.open?.();
      }
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "Cloudinary Upload Widget খোলা যায়নি");
    }
  }, [cloudName, selectAsset, uploadPreset]);

  useImperativeHandle(ref, () => ({ openGallery, openUpload }), [openGallery, openUpload]);

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "space-y-2"}>
      {!compact ? <p className="text-sm font-medium">{label}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void openGallery()}
          disabled={Boolean(busy)}
          className="border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-60"
        >
          {busy === "gallery" ? "Gallery খোলা হচ্ছে…" : "☁ Cloudinary Gallery"}
        </button>
        <button
          type="button"
          onClick={() => void openUpload()}
          disabled={Boolean(busy)}
          className="border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-60"
        >
          {busy === "upload" ? "আপলোড হচ্ছে…" : "নতুন ছবি আপলোড করুন"}
        </button>
      </div>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
});

CloudinaryMediaPicker.displayName = "CloudinaryMediaPicker";

export default CloudinaryMediaPicker;
