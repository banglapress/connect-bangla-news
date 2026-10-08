import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDeskStaff } from "@/lib/desk/staff";
import { createCloudinaryUploadSignature } from "@/lib/cloudinary.server";

export const signCloudinaryUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    timestamp: z.number().int().positive(),
    source: z.string().optional(),
    folder: z.string().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    await assertDeskStaff(context as { supabase: any; userId: string });
    return createCloudinaryUploadSignature(data);
  });
