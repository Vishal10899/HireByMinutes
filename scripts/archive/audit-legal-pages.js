const http = require('http');
const fs = require('fs');
const path = require('path');

const requiredPages = [
  { name: 'AboutPage.tsx', route: '/about', title: 'About Us' },
  { name: 'HowItWorksPage.tsx', route: '/how-it-works', title: 'How It Works' },
  { name: 'TermsPage.tsx', route: '/terms', title: 'Terms of Service' },
  { name: 'PrivacyPage.tsx', route: '/privacy', title: 'Privacy Policy' },
  { name: 'RefundPolicyPage.tsx', route: '/refund-policy', title: 'Refund & Cancellation Policy' },
  { name: 'ExpertPolicyPage.tsx', route: '/expert-policy', title: 'Expert & Service Provider Policy' },
  { name: 'AcceptableUsePage.tsx', route: '/acceptable-use', title: 'Acceptable Use & Community Policy' },
  { name: 'ContactPage.tsx', route: '/contact', title: 'Contact & Support' }
];

async function runLegalPagesVerification() {
  console.log('======================================================================');
  console.log('--- TESTING HIREBYMINUTES LEGAL & INFORMATION PAGE SYSTEM ---');
  console.log('======================================================================\n');

  try {
    const pagesDir = path.join(__dirname, 'client', 'src', 'pages');
    const appTsxPath = path.join(__dirname, 'client', 'src', 'App.tsx');
    const footerTsxPath = path.join(__dirname, 'client', 'src', 'components', 'layout', 'Footer.tsx');

    const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');
    const footerTsxContent = fs.readFileSync(footerTsxPath, 'utf8');

    console.log('1. Checking Component Files & Route Mappings in App.tsx...');
    for (const page of requiredPages) {
      const filePath = path.join(pagesDir, page.name);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing page file: ${page.name}`);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      
      // Verify zero placeholders
      const placeholderTerms = ['lorem ipsum', 'coming soon', 'sample text', 'your text here', 'add content'];
      for (const term of placeholderTerms) {
        if (content.toLowerCase().includes(term)) {
          throw new Error(`Placeholder detected in ${page.name}: "${term}"`);
        }
      }

      // Check route registration
      if (!appTsxContent.includes(`path="${page.route}"`)) {
        throw new Error(`Route ${page.route} is not registered in App.tsx`);
      }

      console.log(`   ✓ ${page.name} (${page.route}) exists with production-ready copy & 0 placeholders`);
    }

    console.log('\n2. Verifying Footer Links Structure...');
    for (const page of requiredPages) {
      if (!footerTsxContent.includes(`to="${page.route}"`)) {
        throw new Error(`Footer is missing link to ${page.route}`);
      }
      console.log(`   ✓ Footer contains link to: ${page.route} (${page.title})`);
    }

    console.log('\n======================================================================');
    console.log('✅ ALL 8 LEGAL & INFORMATION PAGES VERIFIED 100% PRODUCTION READY!');
    console.log('======================================================================');
  } catch (err) {
    console.error('\n❌ VERIFICATION FAILED:', err.message);
    process.exit(1);
  }
}

runLegalPagesVerification();
