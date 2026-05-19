"use client";

import { AuthSessionsPanel } from "@/components/AuthSessionsPanel";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

export default function AccountSessionsPage() {
  const { user } = useAuth();

  return (
    <ProtectedRoute>
      <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500 max-w-2xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-light tracking-tight">Phiên đăng nhập</h1>
          <p className="text-muted text-sm">
            Xem và quản lý các thiết bị/trình duyệt đang dùng tài khoản của bạn.
          </p>
        </div>
        {user && <AuthSessionsPanel userId={user.uid} />}
      </div>
    </ProtectedRoute>
  );
}
