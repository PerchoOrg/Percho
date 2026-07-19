import { redirect } from 'next/navigation';

export default function AdminPipelineRedirect() {
  redirect('/admin/pipeline/tour-jobs');
}
