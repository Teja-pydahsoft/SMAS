import { redirect } from 'next/navigation';

export default function RolesIndexPage() {
  redirect('/roles/create');
}
