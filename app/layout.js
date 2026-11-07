import Script from 'next/script';
import './site.css';

export const metadata = {
  title: 'Hafijur Rahman Bhuiyan · Software Engineer',
  description:
    'Software engineer building AI-powered products and full-stack systems.',
  icons: {
    icon: '/assets/favicon/favicon.ico',
    apple: '/assets/favicon/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Sora:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/css/style.css" />
        <Script src="/js/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
