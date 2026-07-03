import { redirect } from 'next/navigation';

export default function DepartmentsIndexPage() {
  redirect('/departments/create');
}
