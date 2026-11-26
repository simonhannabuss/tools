import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy — Simon's Tools", robots: { index: true, follow: false } };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6 }}>
      <h1>Privacy policy</h1>
      <p className="sub">Simon&apos;s Tools · last updated 26 November 2026</p>

      <p>
        Simon&apos;s Tools is a private publishing tool used only by its owner, Simon Hannabuss, to post his own content to his
        own social media accounts. There is no public sign-up and no other users.
      </p>

      <h2>What it accesses</h2>
      <p>
        When Simon connects an account (for example YouTube, LinkedIn, Instagram or a Facebook Page), the tool receives
        permission to upload and publish posts on that account and to read the performance statistics of those posts (such
        as views, likes and watch time). It does not read private messages, contacts or anyone else&apos;s data.
      </p>

      <h2>What it stores</h2>
      <p>
        Access tokens for the connected accounts (encrypted), the videos and text Simon uploads to publish, and the
        statistics of the published posts. Everything is stored on Simon&apos;s own server and is not shared with or sold to
        anyone. Uploaded video files are deleted automatically after publishing.
      </p>

      <h2>Removing access</h2>
      <p>
        Access can be removed at any time from the connected platform&apos;s own settings (for example your Google Account →
        Security → Third-party connections), which stops the tool working with that account. Stored data can be deleted on
        request.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: via <a href="https://simonhannabuss.co.uk">simonhannabuss.co.uk</a>.
      </p>
    </main>
  );
}
