import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import {
  BookOpenText,
  CheckCircle,
  Lightning,
  PencilLine,
  SquaresFour,
  Timer,
  Translate,
} from "@phosphor-icons/react/dist/ssr";
import { HeroIllustration } from "@/components/landing/HeroIllustration";
import { LandingNav } from "@/components/landing/LandingNav";
import { StartChatLink } from "@/components/landing/StartChatLink";
import { UI_PATTERN_OPTIONS } from "@/lib/chat/scope-options";

const BENEFITS: { icon: Icon; title: string; desc: string }[] = [
  {
    icon: Lightning,
    title: "Tối ưu trải nghiệm",
    desc: "Dùng từ ngữ rõ ràng, hiệu quả theo đúng ngữ cảnh UI.",
  },
  {
    icon: Timer,
    title: "Viết hiệu quả",
    desc: "Đáp ứng nhanh cho task MVP, hot fix và quick fix.",
  },
  {
    icon: CheckCircle,
    title: "Tiết kiệm thời gian",
    desc: "Giảm số vòng review với UX Writer.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <LandingNav />
      <main className="flex-1">
        <Hero />
        <Benefits />
        <Coverage />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_75%_35%,color-mix(in_oklab,var(--link)_14%,transparent),transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 md:px-8 md:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-20">
        <div className="landing-rise flex flex-col items-start gap-6">
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium text-muted">
            Trợ lý nội bộ cho đội sản phẩm Zalo
          </span>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-foreground md:text-5xl xl:text-[52px]">
            Viết đúng chuẩn Zalo,
            <span className="block text-link">ngay từ bản nháp đầu</span>
          </h1>
          <p className="max-w-[46ch] text-lg leading-relaxed text-muted">
            Hỏi guideline, nhận gợi ý microcopy theo ngữ cảnh UI và giữ ngôn ngữ nhất quán trên toàn sản phẩm.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <StartChatLink location="hero" />
            <a
              href="#pham-vi"
              className="inline-flex h-12 items-center whitespace-nowrap rounded-xl border border-border bg-surface px-6 text-base font-semibold text-foreground transition-colors hover:border-link/40 active:scale-[0.98]"
            >
              Xem phạm vi
            </a>
          </div>
        </div>
        <div className="landing-rise [animation-delay:120ms]">
          <HeroIllustration />
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section className="border-y border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-12">
        <h2 className="max-w-[18ch] text-balance text-3xl font-semibold leading-tight tracking-[-0.03em] text-foreground md:text-4xl lg:col-span-5">
          Lợi ích khi chuẩn hóa ngôn từ
        </h2>
        <ul className="divide-y divide-border lg:col-span-7">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-5 py-6 first:pt-0 last:pb-0">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-link/10 text-link">
                <Icon size={22} />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
                <p className="text-base leading-relaxed text-muted">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Coverage() {
  return (
    <section id="pham-vi" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <h2 className="mb-10 max-w-[22ch] text-balance text-3xl font-semibold leading-tight tracking-[-0.03em] text-foreground md:text-4xl">
          Xây dựng nội dung nhất quán
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <BentoCell
            span="md:col-span-4"
            tone="brand"
            icon={PencilLine}
            title="Tiêu chí & Tông điệu"
            desc="Tiêu chí viết, tông điệu và cách xưng hô của Zalo đối với 70 triệu người dùng."
          />
          <BentoCell
            span="md:col-span-2"
            icon={BookOpenText}
            title="Thuật ngữ & Từ vựng"
            desc="Tra cứu thuật ngữ và từ vựng chuẩn hóa đang dùng trong thực tế."
          />
          <BentoCell
            span="md:col-span-2"
            icon={Translate}
            title="Tiếng Anh trên Zalo"
            desc="Quy tắc tiếng Anh đồng nhất trên toàn bộ hệ thống Zalo."
          />
          <BentoCell
            span="md:col-span-4"
            tone="tint"
            icon={SquaresFour}
            title="Cấu trúc & Mẫu viết"
            desc="Mẫu cấu trúc và cách viết cho từng loại thông điệp, theo đúng kiểu UI."
          >
            <ul className="mt-6 flex flex-wrap gap-2">
              {UI_PATTERN_OPTIONS.map((p) => (
                <li
                  key={p.value}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground"
                >
                  {p.label}
                </li>
              ))}
            </ul>
          </BentoCell>
        </div>
      </div>
    </section>
  );
}

// Two of four cells carry a tinted surface so the grid isn't a wall of white cards.
const BENTO_TONES = {
  plain: {
    cell: "border-border bg-surface text-foreground",
    icon: "bg-link/10 text-link",
    desc: "text-muted",
  },
  // Fixed deep Zalo blue: stays distinct from the surface in both themes.
  brand: {
    cell: "border-transparent bg-[linear-gradient(135deg,#0b1f3a_0%,#0a3a86_100%)] text-white",
    icon: "bg-white/10 text-white",
    desc: "text-white/75",
  },
  tint: {
    cell: "border-link/25 bg-link/10 text-foreground",
    icon: "bg-link/10 text-link",
    desc: "text-muted",
  },
} as const;

function BentoCell({
  span,
  tone = "plain",
  icon: Icon,
  title,
  desc,
  children,
}: {
  span: string;
  tone?: keyof typeof BENTO_TONES;
  icon: Icon;
  title: string;
  desc: string;
  children?: ReactNode;
}) {
  const t = BENTO_TONES[tone];
  return (
    <article className={`flex flex-col rounded-2xl border p-6 md:p-8 ${span} ${t.cell}`}>
      <span className={`mb-6 grid size-11 place-items-center rounded-xl ${t.icon}`}>
        <Icon size={22} />
      </span>
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{title}</h3>
      <p className={`mt-2 max-w-[48ch] text-base leading-relaxed ${t.desc}`}>{desc}</p>
      {children}
    </article>
  );
}

function ClosingCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8 md:pb-28">
      <div className="flex flex-col items-start gap-6 rounded-2xl border border-border bg-surface p-8 md:flex-row md:items-center md:justify-between md:p-12">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground md:text-3xl">
            Bắt đầu với câu hỏi đầu tiên
          </h2>
          <p className="max-w-[52ch] text-base leading-relaxed text-muted">
            Mô tả màn hình hoặc dán bản nháp, trợ lý sẽ đối chiếu với guideline.
          </p>
        </div>
        <StartChatLink location="closing" />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between md:px-8">
        <span className="font-medium text-foreground">Zalo Content Guidelines</span>
        <span>Design system inspired by Superhuman</span>
      </div>
    </footer>
  );
}
