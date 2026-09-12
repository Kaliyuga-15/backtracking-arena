import { DEFAULT_CONTEST_KEY } from '@/lib/api';
import AdminConsole from '@/components/AdminConsole';

export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return <AdminConsole contestKey={DEFAULT_CONTEST_KEY} />;
}
