const STAFF_ROLES = ["admin", "editor", "news_editor", "sub_editor", "reporter"];

export async function assertDeskStaff(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((row: { role: string }) => row.role);
  if (!roles.some((role: string) => STAFF_ROLES.includes(role))) {
    throw new Error("শুধু সম্পাদকীয় দল এআই ডেস্ক ব্যবহার করতে পারে");
  }
  return roles as string[];
}
