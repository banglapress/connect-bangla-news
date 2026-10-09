import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { facebookPublicStatus, publishPagePhoto } from "@/lib/desk/facebook";
import { uploadCardImage } from "@/lib/desk/social.helpers";

export const publishHeadlinePhotocard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        imageDataUrl: z
          .string()
          .max(4_200_000, "ফটোকার্ডটি বেশি বড়। আবার পোস্ট করার চেষ্টা করুন।")
          .regex(
            /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/,
            "ফটোকার্ডের ছবি সঠিক ফরম্যাটে তৈরি হয়নি।",
          ),
        caption: z.string().trim().min(1, "Facebook ক্যাপশন লিখুন।").max(5_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as Parameters<typeof assertDeskStaff>[0]);

    if (!facebookPublicStatus().configured) {
      throw new Error(
        "Facebook সংযোগ পাওয়া যায়নি। Vercel-এর META_ACCESS_TOKEN এবং META_PAGE_ID পরীক্ষা করুন।",
      );
    }

    // Reuse the existing newsroom's server-side Cloudinary image upload.
    const imageUrl = await uploadCardImage(
      context.supabase,
      "headline-" + crypto.randomUUID(),
      data.imageDataUrl,
    );
    if (!/^https:\/\//i.test(imageUrl)) {
      throw new Error("Facebook-এ পাঠানোর আগে ছবির public HTTPS URL তৈরি করা যায়নি।");
    }

    const posted = await publishPagePhoto({
      imageUrl,
      caption: data.caption,
    });

    if (!posted.postId) {
      throw new Error("Facebook কোনো post ID ফেরত দেয়নি। পেজে পোস্ট হয়েছে কি না যাচাই করে নিন।");
    }

    return {
      ok: true,
      postId: posted.postId,
      photoId: posted.photoId,
      imageUrl,
    };
  });
