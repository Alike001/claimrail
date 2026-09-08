import type { Metadata } from "next";
import Link from "next/link";
import { DocsConsumerGuide } from "@/src/components/docs-consumer-guide";
import { DocsDeveloperGuide } from "@/src/components/docs-developer-guide";
import { Header } from "@/src/components/header";
import { documentationNavigation } from "@/src/content/docs";

export const metadata: Metadata = {
  title: "Learn",
  description:
    "Understand how ClaimRail finds, explains, and safely claims finished DreamDEX positions—or integrate its settlement API.",
};

function DocsNavigation({ label }: { readonly label: string }) {
  return (
    <nav aria-label={label}>
      {documentationNavigation.map((group) => (
        <div className="docs-nav-group" key={group.title}>
          <strong>{group.title}</strong>
          {group.items.map(([name, href]) => (
            <Link href={href} key={name}>
              {name}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function DocumentationPage() {
  return (
    <div className="docs-shell">
      <Header active="docs" />
      <main className="docs-layout" id="main-content">
        <aside className="docs-sidebar">
          <div className="docs-sidebar-title">
            <span>ClaimRail</span>
            <strong>Learn</strong>
          </div>
          <DocsNavigation label="Documentation sections" />
          <Link className="docs-sidebar-help" href="/developers">
            Building an integration? <span>Open developer hub →</span>
          </Link>
        </aside>

        <article className="docs-article">
          <details className="docs-mobile-nav">
            <summary>Browse this guide</summary>
            <DocsNavigation label="Mobile documentation sections" />
          </details>
          <header className="docs-intro" id="overview">
            <p className="docs-breadcrumb">
              <span>Learn</span> / Overview
            </p>
            <h1>Understand ClaimRail without learning the plumbing.</h1>
            <p className="docs-lead">
              ClaimRail helps DreamDEX position holders see what finished, understand the result,
              and collect available funds. Builders can use the same verified settlement data in
              their own products.
            </p>
            <div className="docs-actions">
              <Link className="primary-action" href="/">
                Check a wallet <span>→</span>
              </Link>
              <Link href="#client">I&apos;m building with ClaimRail ↓</Link>
            </div>
            <div className="docs-entry-paths" aria-label="Choose a learning path">
              <Link href="#use-claimrail">
                <span>For position holders</span>
                <strong>Learn how to check and claim funds</strong>
                <i>Start here →</i>
              </Link>
              <Link href="#client">
                <span>For builders</span>
                <strong>Add settlement data to a product</strong>
                <i>Developer quick start →</i>
              </Link>
            </div>
          </header>

          <DocsConsumerGuide />
          <DocsDeveloperGuide />

          <nav className="docs-pager" aria-label="Documentation pagination">
            <Link href="/">
              <span>Back</span>
              <strong>ClaimRail home</strong>
            </Link>
            <Link href="/developers">
              <span>Next</span>
              <strong>Developer hub →</strong>
            </Link>
          </nav>
        </article>

        <aside className="docs-on-page">
          <strong>On this page</strong>
          <nav aria-label="On this page">
            <Link href="#overview">Overview</Link>
            <Link href="#quick-tour">Three-minute tour</Link>
            <Link href="#use-claimrail">Using ClaimRail</Link>
            <Link href="#manual-claim">Claiming funds</Link>
            <Link href="#safety">Safety</Link>
            <Link href="#client">Developer quick start</Link>
            <Link href="#api">API reference</Link>
          </nav>
        </aside>
      </main>
      <footer className="status-footer docs-footer">
        <span>Somnia Shannon · chain 50312 · DreamDEX SDK 0.29.0</span>
        <span>independent ClaimRail interface</span>
      </footer>
    </div>
  );
}
