import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'

export const metadata = {
  metadataBase: new URL('https://github.com/vooyajs/fs'),
  title: { template: '%s | Vooya FS' },
  description:
    'Native batch filesystem operations for Node.js, powered by Rust and measured at explicit workload boundaries.',
}

export default async function RootLayout({ children }) {
  const navbar = (
    <Navbar
      logo={<span className="font-bold">Vooya FS</span>}
      projectLink="https://github.com/vooyajs/fs"
      docsRepositoryBase="https://github.com/vooyajs/fs/tree/feat/vooya-fs-next/docs"
    />
  )
  const pageMap = await getPageMap()
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <Layout
          navbar={navbar}
          footer={<Footer>MIT {new Date().getFullYear()} © Vooya FS.</Footer>}
          pageMap={pageMap}
          editLink="Edit this page on GitHub"
          docsRepositoryBase="https://github.com/vooyajs/fs/blob/feat/vooya-fs-next/docs"
          sidebar={{ defaultMenuCollapseLevel: 1 }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
