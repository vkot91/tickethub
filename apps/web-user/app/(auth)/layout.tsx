import { Card } from '@tickethub/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-295 justify-center px-6 py-16 [animation:var(--animate-fade)]">
      <Card radius="panel" padding="lg" className="w-full max-w-105">
        {children}
      </Card>
    </div>
  );
}
