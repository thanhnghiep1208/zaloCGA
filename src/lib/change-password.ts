import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  type User,
} from "firebase/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-username";

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

/** Returns an error message, or null when the input is valid. */
export function validateChangePasswordInput(input: ChangePasswordInput): string | null {
  if (!input.currentPassword) return "Nhập mật khẩu hiện tại.";
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  if (input.newPassword !== input.confirmPassword) return "Mật khẩu xác nhận không khớp.";
  if (input.newPassword === input.currentPassword) {
    return "Mật khẩu mới phải khác mật khẩu hiện tại.";
  }
  return null;
}

export function changePasswordErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Mật khẩu hiện tại không đúng.";
    case "auth/too-many-requests":
      return "Thử sai quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.";
    case "auth/weak-password":
      return "Mật khẩu mới quá yếu.";
    case "auth/network-request-failed":
      return "Lỗi mạng. Kiểm tra kết nối rồi thử lại.";
    default:
      return "Không thể đổi mật khẩu. Thử lại sau.";
  }
}

/** Re-authenticates with the current password (Firebase requires a recent login), then updates it. */
export async function changeOwnPassword(
  user: User,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!user.email) throw new Error("Account has no email credential");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}
