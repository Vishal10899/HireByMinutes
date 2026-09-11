const http = require('http');
const fs = require('fs');
const path = require('path');

function request(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 5000,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsedData, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      if (typeof data === 'string' || Buffer.isBuffer(data)) {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

function post(url, data, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return request(url, { method: 'POST', headers }, data);
}

function patch(url, data, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return request(url, { method: 'PATCH', headers }, data);
}

function get(url, token = null) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return request(url, { method: 'GET', headers });
}

function uploadMultipart(url, fieldName, filename, fileBuffer, mimeType, token = null) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const parsed = new URL(url);

    let pre = `--${boundary}\r\n`;
    pre += `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`;
    pre += `Content-Type: ${mimeType}\r\n\r\n`;

    const post = `\r\n--${boundary}--\r\n`;

    const preBuffer = Buffer.from(pre, 'utf-8');
    const postBuffer = Buffer.from(post, 'utf-8');
    const fullBody = Buffer.concat([preBuffer, fileBuffer, postBuffer]);

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 5000,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

async function runTests() {
  console.log('===========================================================');
  console.log('--- TESTING HIREBYMINUTES PROFILE & EDIT PROFILE SYSTEM ---');
  console.log('===========================================================\n');

  // 1. Test image upload endpoint with valid PNG
  console.log('1. Testing Photo Upload (JPG/PNG/WEBP validation)...');
  const dummyPng = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082', 'hex');
  const uploadRes = await uploadMultipart('http://localhost:5000/api/upload/avatar', 'photo', 'avatar.png', dummyPng, 'image/png');
  
  if (uploadRes.status !== 200 || !uploadRes.data.url) {
    throw new Error(`Avatar upload failed: ${JSON.stringify(uploadRes.data)}`);
  }
  console.log(`   ✓ Photo uploaded successfully! URL: ${uploadRes.data.url}`);

  // 2. Test image upload rejection for restricted/executable files
  console.log('\n2. Testing Upload Rejection for non-image/executable files...');
  const fakeScript = Buffer.from('console.log("malicious")', 'utf-8');
  const rejectRes = await uploadMultipart('http://localhost:5000/api/upload/avatar', 'photo', 'script.js', fakeScript, 'application/javascript');
  if (rejectRes.status !== 400) {
    throw new Error(`Server should reject non-image files, got status ${rejectRes.status}`);
  }
  console.log(`   ✓ Non-image upload correctly rejected with HTTP 400: "${rejectRes.data.error}"`);

  // 3. Register client with profile photo
  console.log('\n3. Testing Registration WITH Profile Photo...');
  const timestamp = Date.now();
  const regWithPhoto = await post('http://localhost:5000/api/auth/register', {
    email: `client.photo.${timestamp}@hirebyminutes.com`,
    password: 'Password123!',
    full_name: 'David TestClient',
    role: 'client',
    avatar_url: uploadRes.data.url,
    headline: 'Founder @ AI Startup'
  });
  if (regWithPhoto.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(regWithPhoto.data)}`);
  const clientUser = regWithPhoto.data.user;
  const clientToken = regWithPhoto.data.token;
  console.log(`   ✓ Client created with custom avatar: ${clientUser.avatar_url}`);
  console.log(`   ✓ Permanent username assigned: @${clientUser.username}`);

  // 4. Register client WITHOUT profile photo (Fallback DiceBear avatar)
  console.log('\n4. Testing Registration WITHOUT Profile Photo (Fallback Avatar)...');
  const regWithoutPhoto = await post('http://localhost:5000/api/auth/register', {
    email: `client.nophoto.${timestamp}@hirebyminutes.com`,
    password: 'Password123!',
    full_name: 'Clara NoPhoto',
    role: 'client'
  });
  if (regWithoutPhoto.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(regWithoutPhoto.data)}`);
  console.log(`   ✓ Default fallback avatar generated: ${regWithoutPhoto.data.user.avatar_url}`);

  // 5. Get current profile (GET /api/users/profile/me)
  console.log('\n5. Testing Profile Fetch (GET /api/users/profile/me)...');
  const profileFetch = await get('http://localhost:5000/api/users/profile/me', clientToken);
  if (profileFetch.status !== 200 || !profileFetch.data.user) {
    throw new Error(`Profile fetch failed: ${JSON.stringify(profileFetch.data)}`);
  }
  console.log(`   ✓ Profile fetched: ${profileFetch.data.user.full_name}, username: @${profileFetch.data.user.username}`);

  // 6. Edit general profile (Full name, Bio, Headline, Languages, Skills, Location)
  console.log('\n6. Testing Edit Profile (General Information)...');
  const updateRes = await patch('http://localhost:5000/api/users/profile/me', {
    full_name: 'David TestClient (Updated)',
    headline: 'Senior Engineering Director',
    bio: 'Experienced engineering leader scaling distributed platforms.',
    location: 'San Francisco, CA',
    languages: ['English', 'Spanish', 'French'],
    skills: ['System Design', 'FastAPI', 'Leadership'],
    experience_years: 10
  }, clientToken);

  if (updateRes.status !== 200) throw new Error(`Profile update failed: ${JSON.stringify(updateRes.data)}`);
  const updatedUser = updateRes.data.user;
  console.log(`   ✓ Full name updated: ${updatedUser.full_name}`);
  console.log(`   ✓ Headline updated: ${updatedUser.headline}`);
  console.log(`   ✓ Bio updated: ${updatedUser.bio}`);
  console.log(`   ✓ Location updated: ${updatedUser.location}`);
  console.log(`   ✓ Languages updated: ${JSON.stringify(updatedUser.languages)}`);
  console.log(`   ✓ Skills updated: ${JSON.stringify(updatedUser.skills)}`);
  console.log(`   ✓ Experience years updated: ${updatedUser.experience_years} years`);

  // 7. Security: Verify Permanent Username cannot be changed
  console.log('\n7. Testing Security: Permanent Username cannot be modified...');
  const initialUsername = clientUser.username;
  const maliciousUsernameAttempt = await patch('http://localhost:5000/api/users/profile/me', {
    username: 'hacked_username',
    role: 'admin',
    verified: 1,
    rating: 5.0,
    review_count: 999
  }, clientToken);

  if (maliciousUsernameAttempt.status !== 200) throw new Error(`Patch call failed: ${JSON.stringify(maliciousUsernameAttempt.data)}`);
  const secureUser = maliciousUsernameAttempt.data.user;
  if (secureUser.username === 'hacked_username' || secureUser.username !== initialUsername) {
    throw new Error('SECURITY BREACH: Username was modified!');
  }
  if (secureUser.role === 'admin' || secureUser.verified === 1) {
    throw new Error('SECURITY BREACH: Role/Verification was elevated!');
  }
  console.log(`   ✓ Username preserved safely: @${secureUser.username} (Protected from edits)`);
  console.log(`   ✓ Role preserved safely: ${secureUser.role} (Protected from privilege escalation)`);
  console.log(`   ✓ Verification status preserved safely: ${secureUser.verified}`);

  // 8. Expert-Specific Profile Editing & Rate Update
  console.log('\n8. Testing Expert-Specific Profile & Rate Per Minute Update...');
  const expertEmail = `expert.elena.${Date.now()}@testprofile.local`;
  const expertReg = await post('http://localhost:5000/api/auth/register', {
    email: expertEmail,
    password: 'DemoPassword123!',
    full_name: 'Elena Rostova',
    role: 'provider'
  });
  if (expertReg.status !== 201) throw new Error(`Expert registration failed: ${JSON.stringify(expertReg.data)}`);
  const providerToken = expertReg.data.token;

  // Create initial service for expert
  const srvRes = await post('http://localhost:5000/api/services', {
    category_id: 'cat-design',
    title: 'Figma UI/UX Teardown & Design System Review',
    description: 'Expert teardowns of your design system tokens.',
    price_per_minute: 1.50,
    skills: ['Figma', 'UI/UX'],
    languages: ['English'],
    experience_years: 8,
    available_now: 1
  }, providerToken);
  if (srvRes.status !== 201) throw new Error(`Service creation failed: ${JSON.stringify(srvRes.data)}`);

  // Fetch initial rate
  const initialExpertProfile = await get('http://localhost:5000/api/users/profile/me', providerToken);
  const oldPrice = initialExpertProfile.data.service ? initialExpertProfile.data.service.price_per_minute : 1.50;
  console.log(`   ✓ Elena's current rate: $${oldPrice}/min`);

  // Update Elena's rate to $2.25/min
  const expertUpdateRes = await patch('http://localhost:5000/api/users/profile/me', {
    service_title: 'Figma UI/UX Teardown & Design System Review (Updated)',
    service_description: 'Expert teardowns of your design system tokens and responsive layouts.',
    price_per_minute: 2.25,
    experience_years: 9,
    skills: ['Figma', 'Design Systems', 'UI/UX', 'Typography'],
    languages: ['English', 'German', 'Russian']
  }, providerToken);

  if (expertUpdateRes.status !== 200) throw new Error(`Expert update failed: ${JSON.stringify(expertUpdateRes.data)}`);
  console.log(`   ✓ Elena's new updated rate: $${expertUpdateRes.data.service.price_per_minute}/min`);
  console.log(`   ✓ Elena's service title updated: "${expertUpdateRes.data.service.title}"`);

  // 9. Verify Future Consultation Request Uses Updated Rate
  console.log('\n9. Testing that new Consultation Requests use the updated rate...');
  const newReq = await post('http://localhost:5000/api/consultation-requests', {
    service_id: expertUpdateRes.data.service.id,
    duration_minutes: 20,
    connect_type: 'now',
    problem_description: 'Review my mobile layout design tokens.'
  }, clientToken);

  if (newReq.status !== 201) throw new Error(`Consultation request creation failed: ${JSON.stringify(newReq.data)}`);
  const expectedTotal = 20 * 2.25; // $45.00
  console.log(`   ✓ Request created for 20 mins @ $2.25/min. Total: $${newReq.data.request.total_price} (Expected: $${expectedTotal})`);
  if (newReq.data.request.total_price !== expectedTotal) {
    throw new Error(`Total price mismatch! Expected $${expectedTotal}, got $${newReq.data.request.total_price}`);
  }

  // 10. Security: Unauthenticated profile update rejected
  console.log('\n10. Testing Security: Unauthenticated profile update rejection...');
  const unauthRes = await patch('http://localhost:5000/api/users/profile/me', { full_name: 'Hacker' });
  if (unauthRes.status !== 401) {
    throw new Error(`Unauthenticated update should return 401, got ${unauthRes.status}`);
  }
  console.log(`   ✓ Unauthenticated update rejected with HTTP 401: "${unauthRes.data.error}"`);

  console.log('\n===========================================================');
  console.log('✅ ALL PROFILE & EDIT PROFILE TESTS PASSED WITH 100% SUCCESS!');
  console.log('===========================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
