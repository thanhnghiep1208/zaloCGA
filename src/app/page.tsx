"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/gtag";


export default function LandingPage() {
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

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12 md:py-24 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      {/* Hero Section */}
      <div className="text-center space-y-10 mb-20">
        <div className="space-y-4">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight text-foreground leading-[1.1]">
            Zalo Content <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-blue-500">Guidelines</span>
          </h1>
          <p className="text-lg md:text-xl text-muted font-medium max-w-2xl mx-auto opacity-80">
            Tra cứu quy cách viết, tối ưu hóa trải nghiệm người dùng dành riêng cho Zalo.
          </p>
        </div>

        {/* Primary CTA moved up */}
        <div className="flex justify-center">
          <Link 
            href="/chat"
            onClick={() => trackEvent("start_chat_click")}
            className="group relative inline-flex items-center gap-2 bg-accent text-white px-12 py-5 rounded-full font-bold text-xl transition-all shadow-[0_20px_50px_rgba(0,111,238,0.3)] hover:shadow-[0_20px_50px_rgba(0,111,238,0.5)] hover:scale-105 active:scale-95 overflow-hidden"
          >

            <span className="relative z-10">Bắt đầu ngay</span>
            <svg className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            <div className="absolute inset-0 bg-gradient-to-r from-accent to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Link>
        </div>
      </div>

      {/* Professional Benefit Chips (Now Unified Cards) */}
      <section className="mb-24">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-10">
          Lợi ích khi chuẩn hóa ngôn từ
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {benefits.map((b, i) => (
          <div key={i} className="group bg-surface/40 border border-border/60 p-8 rounded-[2rem] hover:bg-white dark:hover:bg-accent/5 hover:border-accent/40 hover:shadow-2xl hover:shadow-accent/5 transition-all duration-500">
            <div className="w-14 h-14 bg-surface border border-border rounded-2xl flex items-center justify-center text-accent mb-6 group-hover:bg-accent group-hover:text-white transition-all duration-300 shadow-sm">
              <div className="scale-110">{b.icon}</div>
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">{b.title}</h3>
            <p className="text-sm text-muted leading-relaxed opacity-80">{b.desc}</p>
          </div>
        ))}
        </div>
      </section>

    

      {/* Category Grid (Unified) */}
      <section className="pb-20">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-10">
          Xây dựng nội dung nhất quán
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <div key={i} className="group bg-surface border border-border/60 p-8 rounded-[2rem] hover:bg-white dark:hover:bg-accent/5 hover:border-accent/50 hover:shadow-2xl hover:shadow-accent/10 transition-all duration-500 cursor-default">
            <div className="w-14 h-14 bg-surface border border-border rounded-2xl flex items-center justify-center text-accent mb-6 group-hover:bg-accent group-hover:text-white transition-all duration-300 shadow-sm">
              <div className="scale-110">{card.icon}</div>
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-accent transition-colors">{card.title}</h3>
            <p className="text-sm text-muted leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">{card.desc}</p>
          </div>
        ))}
        </div>
      </section>
    </main>
  );
}
