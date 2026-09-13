import { Link } from "@tanstack/react-router";
import { CATEGORIES } from "@/lib/categories";
import { toBanglaDigits } from "@/lib/bangla";

export function SiteFooter() {
  return (
    <footer className="mt-14 border-t-2 border-foreground bg-secondary">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <span className="font-serif text-2xl font-bold">The Connect</span>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            বাংলা ভাষায় খবর ও মতামতের নির্ভরযোগ্য ঠিকানা। প্রতিদিনের ঘটনা, বিশ্লেষণ ও কলাম।
          </p>
        </div>
        <div>
          <h4 className="section-rule mb-3 pb-1 text-sm font-bold">বিভাগ</h4>
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            {CATEGORIES.map((c) => (
              <Link key={c.slug} to="/category/$slug" params={{ slug: c.slug }} className="hover:text-primary">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h4 className="section-rule mb-3 pb-1 text-sm font-bold">যোগাযোগ</h4>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>সম্পাদক: <span className="text-foreground">সোহেইল জাফর</span></p>
            <p>৭৬ বীরউত্তম কাজী নূরুজ্জামান সরণি, ঢাকা ১২১৫</p>
            <p>ইমেইল: <a href="mailto:theconnectbd@gmail.com" className="hover:text-primary">theconnectbd@gmail.com</a></p>
            <p>ফোন: <a href="tel:+8801819525247" className="hover:text-primary">+৮৮০১৮১৯৫২৫২৪৭</a></p>
            <p className="pt-2">
              <a href="https://www.facebook.com/theconnectbd" target="_blank" rel="noreferrer" className="mr-4 font-medium text-[#1877F2] hover:underline">Facebook</a>
              <a href="https://www.youtube.com/@theconnectbd" target="_blank" rel="noreferrer" className="font-medium text-[#FF0000] hover:underline">YouTube</a>
            </p>
          </div>
          <Link to="/auth" className="mt-3 inline-block text-sm text-primary hover:underline">সম্পাদকীয় প্রবেশ</Link>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {toBanglaDigits(new Date().getFullYear())} The Connect — সর্বস্বত্ব সংরক্ষিত
      </div>
    </footer>
  );
}
