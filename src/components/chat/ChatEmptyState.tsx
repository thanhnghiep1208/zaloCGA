"use client";

export function ChatEmptyState() {
  return (
    <div className="h-full min-h-[420px] flex items-center justify-center opacity-80">
      <div className="flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto px-4">
        <div className="w-20 h-20 bg-surface border border-border rounded-[8px] flex items-center justify-center rotate-3 shadow-sm">
          <svg
            className="w-10 h-10 text-accent/80"
            fill="none"
            strokeWidth={1.5}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.38.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"
            />
          </svg>
        </div>
        <div className="space-y-3 text-foreground">
          <h3 className="text-xl font-medium tracking-tight">
            Prompt theo mẫu nếu bạn cần hỗ trợ viết
          </h3>
          <div className="text-sm text-muted leading-relaxed text-left space-y-3">
            <div>
              <p className="text-foreground/90">1. Goal:</p>
              <p className="italic">
                - Bạn muốn truyền đạt điều gì đến người đọc, và muốn đạt được gì từ content này?
              </p>
            </div>
            <div>
              <p className="text-foreground/90">2. Người đọc sẽ thấy nội dung này vào hoàn cảnh:</p>
              <p className="italic">- Context &amp; usecase cho content này là gì?</p>
            </div>
            <div>
              <p className="text-foreground/90">3. Nội dung này giúp:</p>
              <p className="italic">
                - Người đọc hiểu được gì hoặc làm được gì khi đọc content này?
              </p>
            </div>
            <div>
              <p className="text-foreground/90">4. Định dạng UI:</p>
              <p className="italic">
                - Fullscreen, btm sheet, snackbar,…hay chỉ là title, CTA,…?
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
