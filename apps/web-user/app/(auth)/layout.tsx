import { Card } from '@tickethub/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-295 [animation:var(--animate-fade)] justify-center px-6 py-16">
      <Card radius="panel" padding="lg" className="w-full max-w-105">
        {children}
      </Card>
    </div>
  );
}
