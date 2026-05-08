export function toFriendlyErrorMessage(input: unknown): string {
  const raw = (input instanceof Error ? input.message : String(input || "")).toLowerCase();

  if (raw.includes("api_key_invalid") || raw.includes("api key not found")) {
    return "He thong AI chua san sang (API key khong hop le). Vui long thu lai sau.";
  }
  if (raw.includes("gemini_api_key is missing")) {
    return "He thong AI chua duoc cau hinh day du. Vui long lien he quan tri.";
  }
  if (raw.includes("invalid or expired token") || raw.includes("unauthorized")) {
    return "Phien dang nhap da het han. Vui long dang nhap lai.";
  }
  if (raw.includes("forbidden") || raw.includes("permission")) {
    return "Ban khong co quyen thuc hien thao tac nay.";
  }
  if (raw.includes("storage bucket is not configured")) {
    return "He thong luu tru anh chua cau hinh xong. Vui long lien he quan tri.";
  }
  if (raw.includes("unsupported image type")) {
    return "Dinh dang anh chua ho tro. Vui long dung PNG, JPG, WEBP hoac GIF.";
  }
  if (raw.includes("image too large")) {
    return "Anh vuot qua gioi han cho phep. Vui long chon anh nho hon 10MB.";
  }
  if (raw.includes("title is required")) {
    return "Vui long nhap tieu de tai lieu.";
  }
  if (raw.includes("content is empty") || raw.includes("contenthtml is required")) {
    return "Noi dung tai lieu dang trong. Vui long nhap noi dung truoc khi luu.";
  }
  if (raw.includes("document not found")) {
    return "Khong tim thay tai lieu. Co the tai lieu da bi xoa.";
  }
  if (raw.includes("failed to fetch response") || raw.includes("server error")) {
    return "May chu dang ban. Vui long thu lai sau it phut.";
  }

  return "Co loi xay ra. Vui long thu lai.";
}

