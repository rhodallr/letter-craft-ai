import '@fontsource-variable/schibsted-grotesk';
import '@fontsource/tinos/400.css';
import '@fontsource/tinos/400-italic.css';
import '@fontsource/tinos/700.css';
import '@fontsource/arimo/400.css';
import '@fontsource/arimo/400-italic.css';
import '@fontsource/arimo/700.css';
import './globals.css';

export const metadata = {
  title: 'LetterCraft AI: cover letters matched to the job',
  description:
    'Upload your CV, paste a job description, and get a specific, cliché-free cover letter you can refine and download as a PDF.',
};

export const viewport = {
  themeColor: '#EEF0FB',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
