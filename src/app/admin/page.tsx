import { redirect } from 'next/navigation';

export default function AdminIndexPage() {
  // Automatically route root /admin requests to the library overview
  redirect('/admin/library');
}
