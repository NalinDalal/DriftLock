export const metadata = {
  title: 'DriftLock',
  description: 'Dependabot for API changes',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
