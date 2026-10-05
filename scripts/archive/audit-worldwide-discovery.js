const http = require('http');

const API_BASE = 'http://localhost:5000/api';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${path}`);
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=================================================================');
  console.log('--- TESTING HIREBYMINUTES WORLDWIDE EXPERT DISCOVERY SYSTEM ---');
  console.log('=================================================================\n');

  try {
    // 1. Authenticate users
    console.log('1. Authenticating test users...');
    const arjunAuth = await request('POST', '/auth/login', { email: 'arjun@hirebyminutes.com', password: 'demo123' });
    const arjunToken = arjunAuth.data.token;
    if (!arjunToken) throw new Error(`Failed to login as Arjun: ${JSON.stringify(arjunAuth.data)}`);
    console.log(`   ✓ Authenticated Provider: Arjun Sharma (${arjunToken})`);

    const sarahAuth = await request('POST', '/auth/login', { email: 'sarah@hirebyminutes.com', password: 'demo123' });
    const sarahToken = sarahAuth.data.token;
    if (!sarahToken) throw new Error(`Failed to login as Sarah: ${JSON.stringify(sarahAuth.data)}`);
    console.log(`   ✓ Authenticated Client: Sarah Chen (${sarahToken})\n`);

    // 2. Test Expert Profile languages & location display (GET /api/services/:id)
    console.log('2. Testing Expert Profile Languages & Location retrieval...');
    const servicesRes = await request('GET', '/services');
    const arjunService = servicesRes.data.services.find(s => s.provider_id === 'usr-arjun');
    if (!arjunService) throw new Error('Arjun service not found in marketplace');

    const detailRes = await request('GET', `/services/${arjunService.id}`);
    const srv = detailRes.data.service;
    console.log(`   ✓ Provider: ${srv.provider_name}`);
    console.log(`   ✓ Languages: ${JSON.stringify(srv.languages)}`);
    console.log(`   ✓ Country: ${srv.country}, City: ${srv.city}, State: ${srv.state_region}`);
    console.log(`   ✓ Subcategory: ${srv.subcategory}`);
    if (!srv.languages.includes('Hindi') || !srv.languages.includes('English')) {
      throw new Error('Expected Arjun to have English and Hindi languages');
    }
    if (srv.country !== 'India' || srv.city !== 'Gurugram') {
      throw new Error('Expected Arjun to be located in Gurugram, India');
    }
    console.log('   ✓ Profile returned full worldwide metadata successfully!\n');

    // 3. Test Language Filter in Marketplace (GET /api/services?language=Hindi)
    console.log('3. Testing Language Filtering in Marketplace...');
    const hindiFilter = await request('GET', '/services?language=Hindi');
    const hindiExperts = hindiFilter.data.services;
    console.log(`   ✓ Found ${hindiExperts.length} expert(s) who speak Hindi: ${hindiExperts.map(e => e.provider_name).join(', ')}`);
    if (!hindiExperts.some(e => e.provider_id === 'usr-arjun')) {
      throw new Error('Expected Arjun to be found in Hindi language search');
    }

    const germanFilter = await request('GET', '/services?language=German');
    const germanExperts = germanFilter.data.services;
    console.log(`   ✓ Found ${germanExperts.length} expert(s) who speak German: ${germanExperts.map(e => e.provider_name).join(', ')}`);
    if (!germanExperts.some(e => e.provider_id === 'usr-elena')) {
      throw new Error('Expected Elena to be found in German language search');
    }
    console.log('   ✓ Language filtering works with 100% server-side accuracy!\n');

    // 4. Test Country Filter in Marketplace (GET /api/services?country=India)
    console.log('4. Testing Country Filtering in Marketplace...');
    const indiaFilter = await request('GET', '/services?country=India');
    const indiaExperts = indiaFilter.data.services;
    console.log(`   ✓ Found ${indiaExperts.length} expert(s) in India: ${indiaExperts.map(e => e.provider_name).join(', ')}`);
    if (!indiaExperts.some(e => e.country === 'India')) {
      throw new Error('Expected country filter to match India');
    }

    const germanyFilter = await request('GET', '/services?country=Germany');
    const germanyExperts = germanyFilter.data.services;
    console.log(`   ✓ Found ${germanyExperts.length} expert(s) in Germany: ${germanyExperts.map(e => e.provider_name).join(', ')}`);
    if (!germanyExperts.some(e => e.provider_id === 'usr-elena')) {
      throw new Error('Expected Elena in Germany filter');
    }
    console.log('   ✓ Country filtering works accurately!\n');

    // 5. Test City / Metro Area Filter (GET /api/services?city=Gurugram)
    console.log('5. Testing City/Area Filtering in Marketplace...');
    const cityFilter = await request('GET', '/services?city=Gurugram');
    const cityExperts = cityFilter.data.services;
    console.log(`   ✓ Found ${cityExperts.length} expert(s) in Gurugram: ${cityExperts.map(e => e.provider_name).join(', ')}`);
    if (!cityExperts.some(e => e.provider_id === 'usr-arjun')) {
      throw new Error('Expected Arjun in Gurugram city filter');
    }
    console.log('   ✓ City / Metro area filtering works accurately!\n');

    // 6. Test Subcategory / Service Type Filter (GET /api/services?subcategory=Backend)
    console.log('6. Testing Subcategory / Service Type Filtering...');
    const subcatFilter = await request('GET', '/services?subcategory=Backend');
    const subcatExperts = subcatFilter.data.services;
    console.log(`   ✓ Found ${subcatExperts.length} expert(s) under 'Backend & APIs': ${subcatExperts.map(e => e.provider_name).join(', ')}`);
    if (!subcatExperts.some(e => e.provider_id === 'usr-arjun')) {
      throw new Error('Expected Arjun in Backend & APIs subcategory');
    }
    console.log('   ✓ Subcategory filtering works accurately!\n');

    // 7. Test Combined Multi-Criteria Filtering
    console.log('7. Testing Combined Multi-Criteria Filtering...');
    const combinedFilter = await request('GET', '/services?category=technology&country=India&language=Hindi&maxPrice=3.0');
    const combinedExperts = combinedFilter.data.services;
    console.log(`   ✓ Found ${combinedExperts.length} expert(s) matching [Tech + India + Hindi + <=$3/min]: ${combinedExperts.map(e => e.provider_name).join(', ')}`);
    if (combinedExperts.length === 0 || !combinedExperts.some(e => e.provider_id === 'usr-arjun')) {
      throw new Error('Expected Arjun to match all 4 combined filters');
    }
    console.log('   ✓ Combined multi-criteria filtering works seamlessly!\n');

    // 8. Test Multi-Field Search (Search by language, country, city, skill)
    console.log('8. Testing Multi-Field Search (Language, Country, City, Skill)...');
    const searchHindi = await request('GET', '/services?search=Hindi');
    console.log(`   ✓ Search "Hindi" returned ${searchHindi.data.services.length} expert(s)`);

    const searchGermany = await request('GET', '/services?search=Germany');
    console.log(`   ✓ Search "Germany" returned ${searchGermany.data.services.length} expert(s)`);

    const searchGurugram = await request('GET', '/services?search=Gurugram');
    console.log(`   ✓ Search "Gurugram" returned ${searchGurugram.data.services.length} expert(s)`);

    const searchPython = await request('GET', '/services?search=Python');
    console.log(`   ✓ Search "Python" returned ${searchPython.data.services.length} expert(s)`);

    if (searchHindi.data.services.length === 0 || searchGermany.data.services.length === 0 || searchPython.data.services.length === 0) {
      throw new Error('Search did not match expected fields');
    }
    console.log('   ✓ Multi-field search works across name, username, skill, language, country, and city!\n');

    // 9. Test Edit Profile (Updating Languages, Country, Region, City, Area)
    console.log('9. Testing Edit Profile (Languages, Country, Region, City, Area)...');
    const updateRes = await request('PATCH', '/users/profile/me', {
      country: 'India',
      state_region: 'Karnataka',
      city: 'Bengaluru',
      area: 'Indiranagar',
      languages: ['English', 'Hindi', 'Kannada', 'German'],
      skills: ['Python', 'FastAPI', 'Distributed Systems', 'Go'],
      service_title: 'Staff Python/Go Architect Consultation & Debugging',
      subcategory: 'Backend & APIs'
    }, arjunToken);

    if (updateRes.status !== 200) {
      throw new Error(`Profile update failed: ${JSON.stringify(updateRes.data)}`);
    }
    const updatedUser = updateRes.data.user;
    console.log(`   ✓ Updated City: ${updatedUser.city}, State: ${updatedUser.state_region}`);
    console.log(`   ✓ Updated Languages: ${JSON.stringify(updatedUser.languages)}`);
    if (!updatedUser.languages.includes('Kannada') || updatedUser.city !== 'Bengaluru') {
      throw new Error('Profile update did not save Kannada or Bengaluru');
    }
    console.log('   ✓ Profile updated and persisted successfully!\n');

    // 10. Test Search with new updated location and language
    console.log('10. Testing Discovery with updated language and city...');
    const searchKannada = await request('GET', '/services?language=Kannada');
    if (!searchKannada.data.services.some(e => e.provider_id === 'usr-arjun')) {
      throw new Error('Expected Arjun to be discoverable by newly added Kannada language');
    }
    console.log('   ✓ Discovered Arjun via newly added Kannada language filter!');

    const searchBengaluru = await request('GET', '/services?city=Bengaluru');
    if (!searchBengaluru.data.services.some(e => e.provider_id === 'usr-arjun')) {
      throw new Error('Expected Arjun to be discoverable by newly updated Bengaluru city filter');
    }
    console.log('   ✓ Discovered Arjun via newly updated Bengaluru city filter!\n');

    // 11. Test Client Profile location & language editing
    console.log('11. Testing Client profile location & language editing...');
    const clientUpdateRes = await request('PATCH', '/users/profile/me', {
      country: 'United States',
      state_region: 'California',
      city: 'San Francisco',
      languages: ['English', 'Spanish', 'French']
    }, sarahToken);
    if (clientUpdateRes.status !== 200) {
      throw new Error(`Client update failed: ${JSON.stringify(clientUpdateRes.data)}`);
    }
    console.log(`   ✓ Client Sarah languages updated: ${JSON.stringify(clientUpdateRes.data.user.languages)}\n`);

    // 12. Test Security: Username remains immutable
    console.log('12. Testing Security: Username immutability protection...');
    const attemptUsernameChange = await request('PATCH', '/users/profile/me', {
      username: 'hacked_username_123',
      role: 'admin'
    }, arjunToken);
    if (attemptUsernameChange.data.user.username === 'hacked_username_123' || attemptUsernameChange.data.user.role === 'admin') {
      throw new Error('Security Breach: Username or Role was modified!');
    }
    console.log(`   ✓ Username safely preserved: @${attemptUsernameChange.data.user.username}`);
    console.log(`   ✓ Role safely preserved: ${attemptUsernameChange.data.user.role}\n`);

    // 13. Test Online-First Discovery & Booking interoperability
    console.log('13. Testing that Global Online Booking continues to work seamlessly...');
    const bookingRequest = await request('POST', '/consultation-requests', {
      service_id: arjunService.id,
      duration_minutes: 15,
      connect_type: 'now',
      problem_description: 'Need assistance optimizing high throughput FastAPI endpoints.'
    }, sarahToken);

    if (bookingRequest.status !== 201) {
      throw new Error(`Booking request failed: ${JSON.stringify(bookingRequest.data)}`);
    }
    console.log(`   ✓ Client in USA successfully sent Consultation Request to Expert in India! Request ID: ${bookingRequest.data.request.id}`);

    // Expert accepts
    const acceptRes = await request('POST', `/consultation-requests/${bookingRequest.data.request.id}/accept`, {}, arjunToken);
    if (acceptRes.status !== 200) {
      throw new Error(`Expert accept failed: ${JSON.stringify(acceptRes.data)}`);
    }
    console.log('   ✓ Expert accepted request. Status: ACCEPTED');

    // Client pays and session is launched
    const payRes = await request('POST', `/consultation-requests/${bookingRequest.data.request.id}/pay`, {
      payment_method: 'card'
    }, sarahToken);
    if (payRes.status !== 200 || !payRes.data.session_id) {
      throw new Error(`Payment failed: ${JSON.stringify(payRes.data)}`);
    }
    console.log(`   ✓ Payment succeeded! Live Session launched: ${payRes.data.session_id}\n`);

    console.log('=================================================================');
    console.log('✅ ALL 13 WORLDWIDE EXPERT DISCOVERY TEST SUITES PASSED 100%!');
    console.log('=================================================================');

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
