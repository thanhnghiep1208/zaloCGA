"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/gtag";
import { useTheme } from "@/context/ThemeContext";

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();
  const benefits = [
    {
      title: "Tối ưu trải nghiệm",
      desc: "Cách sử dụng từ ngữ hiệu quả",
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    },
    {
      title: "Viết hiệu quả",
      desc: "Task MVP, hot fix, quick fix",
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    },
    {
      title: "Tiết kiệm thời gian",
      desc: "Giảm review với UX Writers",
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    }
  ];

  const cards = [
    {
      title: "Tiêu chí & Tông điệu",
      desc: "Tiêu chí viết, tông điệu và cách xưng hô của Zalo đối với 70 triệu người dùng",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
    },
    {
      title: "Thuật ngữ & Từ vựng",
      desc: "Tra cứu các thuật ngữ hay từ vựng chuẩn hóa đang dùng trong thực tế",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
    },
    {
      title: "Cấu trúc & Mẫu viết",
      desc: "Tham khảo mẫu cấu trúc và cách viết cho từng loại thông điệp cụ thể",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
    },
    {
      title: "Tiếng Anh trên Zalo",
      desc: "Quy tắc và chuẩn hóa tiếng Anh đồng nhất trên toàn bộ hệ thống Zalo",
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
    }
  ];

  const heroTint =
    theme === "dark"
      ? "from-mysteria via-[#252044] to-[#1b1938]"
      : "from-mysteria via-[#252044] to-[#2a2650]";

  return (
    <main className="flex-1 w-full animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <section
        className={`w-full bg-gradient-to-b ${heroTint} border-b border-white/10`}
      >
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-[80px] flex flex-col">
          <div className="flex justify-end">
        <button
          onClick={toggleTheme}
          className="clay-hover-playful bg-white/10 border border-white/20 p-1.5 rounded-xl text-white backdrop-blur-md"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2.2M12 18.8V21M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M3 12h2.2M18.8 12H21M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12.8A8.8 8.8 0 1111.2 3a7 7 0 109.8 9.8z" />
            </svg>
          )}
        </button>
          </div>
          <div className="flex items-center justify-center">
            <div className="text-center space-y-6 max-w-3xl mx-auto">
              <h1 className="text-4xl md:text-[56px] font-semibold tracking-[-0.045em] text-white/95 leading-[1.03]">
                Zalo Content <br />
                <span className="text-accent">Guidelines</span>
              </h1>
              <p className="text-lg text-white/80 font-light leading-relaxed max-w-3xl mx-auto">
                Tra cứu guideline và gợi ý microcopy theo ngữ cảnh UI cho Zalo, giúp viết nhanh, đúng chuẩn ngay từ đầu, giảm vòng lặp review và giữ ngôn ngữ nhất quán trên toàn sản phẩm.
              </p>
              <div className="pt-2">
                <Link
                  href="/chat"
                  onClick={() => trackEvent("start_chat_click")}
                  className="clay-hover-playful inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-base font-semibold bg-charcoal text-white border border-white/25 shadow-[0_12px_40px_rgba(0,0,0,0.35)] hover:brightness-110 hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)] transition-all"
                >
                  Bắt đầu ngay
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1080px] mx-auto w-full px-6 py-12 md:py-20">
      <section className="mb-24">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.03em] text-foreground text-center mb-10">
          Lợi ích khi chuẩn hóa ngôn từ
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {benefits.map((b, i) => (
            <div
              key={i}
              className="clay-card group p-6 md:p-7 rounded-2xl hover:shadow-[var(--shadow-md)] transition-shadow duration-300"
            >
              <div className="w-12 h-12 bg-accent/25 border border-border rounded-xl flex items-center justify-center text-charcoal mb-5 group-hover:bg-accent/40 transition-colors duration-300">
                <div className="scale-110">{b.icon}</div>
              </div>
              <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-foreground mb-2">{b.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-20">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.03em] text-foreground text-center mb-10">
          Xây dựng nội dung nhất quán
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map((card, i) => (
            <div
              key={i}
              className="clay-card group p-6 md:p-7 rounded-2xl hover:shadow-[var(--shadow-md)] transition-shadow duration-300 cursor-default"
            >
              <div className="w-12 h-12 bg-accent/25 border border-border rounded-xl flex items-center justify-center text-charcoal mb-5 group-hover:bg-accent/40 transition-colors duration-300">
                <div className="scale-110">{card.icon}</div>
              </div>
              <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-foreground mb-2 group-hover:text-link transition-colors">
                {card.title}
              </h3>
              <p className="text-sm text-muted leading-relaxed group-hover:opacity-100 transition-opacity">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

        <p className="text-center text-xs text-muted mt-6">
          Design system inspired by Superhuman
        </p>
      </div>
    </main>
  );
}
