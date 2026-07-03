import { redirect } from 'next/navigation';

export default async function RegistrationsIndexPage({ searchParams }) {
  const params = await searchParams;

  if (params?.edit) {
    redirect(`/registrations/manage?edit=${params.edit}`);
  }

  if (params?.role) {
    redirect(`/registrations/register?role=${params.role}`);
  }

  redirect('/registrations/register');
}
