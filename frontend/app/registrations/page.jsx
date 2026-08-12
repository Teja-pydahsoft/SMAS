import { redirect } from 'next/navigation';

export default async function RegistrationsIndexPage({ searchParams }) {
  const params = await searchParams;

  let query = '';
  if (params?.edit) {
    query = `?edit=${params.edit}`;
  } else if (params?.roleSlug) {
    query = `?roleSlug=${params.roleSlug}`;
  }

  redirect(`/registrations/manage${query}`);
}
