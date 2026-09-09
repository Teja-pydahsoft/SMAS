import { redirect } from 'next/navigation';

export default function JattuRegistrationsPage() {
  redirect('/registrations/manage?roleSlug=jattu');
}
