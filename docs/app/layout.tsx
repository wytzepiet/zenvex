import { RootProvider } from 'fumadocs-ui/provider/next';
import { Analytics } from '@vercel/analytics/next';
import './global.css';
import { DM_Sans, JetBrains_Mono, Instrument_Serif } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${dmSans.className} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
        <Analytics />
      </body>
    </html>
  );
}
