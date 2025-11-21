const express = require('express');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración
const PORT = process.env.PORT || 3000;
const EZEE_CREDENTIALS = {
  username: process.env.EZEE_USERNAME || 'j.robles',
  password: process.env.EZEE_PASSWORD || '07102701JP?',
  propertyCode: process.env.EZEE_PROPERTY_CODE || '44018'
};

const EZEE_URLS = {
  login: 'https://live.ipms247.com/login/',
  reservations: 'https://live.ipms247.com/frontoffice/reservations',
  availability: 'https://live.ipms247.com/frontoffice/stayview'
};

// Navegador compartido (más rápido)
let browser = null;

// Inicializar navegador
async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
  }
  return browser;
}

// Función de scraping
async function scrapeEzee(queryType = 'general') {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    console.log('🔐 Starting eZee scraping...');
    
    // Configurar página
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Ir a login
    console.log('📄 Loading login page...');
    await page.goto(EZEE_URLS.login, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Esperar formulario - usar selectores más flexibles
    console.log('⏳ Waiting for login form...');
    await page.waitForSelector('input[name="username"], input#username, input[placeholder*="Username"]', { timeout: 15000 });
    
    // Llenar formulario - intentar múltiples selectores
    console.log('✍️ Filling login form...');
    const usernameSelector = await page.$('input[name="username"]') ? 'input[name="username"]' : 
                            await page.$('input#username') ? 'input#username' : 
                            'input[placeholder*="Username"]';
    
    const passwordSelector = await page.$('input[name="password"]') ? 'input[name="password"]' : 
                            await page.$('input#password') ? 'input#password' : 
                            'input[type="password"]';
    
    const hotelcodeSelector = await page.$('input[name="hotelcode"]') ? 'input[name="hotelcode"]' : 
                             await page.$('input#hotelcode') ? 'input#hotelcode' : 
                             'input[placeholder*="Property"]';
    
    await page.type(usernameSelector, EZEE_CREDENTIALS.username);
    await page.type(passwordSelector, EZEE_CREDENTIALS.password);
    await page.type(hotelcodeSelector, EZEE_CREDENTIALS.propertyCode);
    
    // Login - buscar el botón SIGN IN
    console.log('🔑 Clicking SIGN IN...');
    const signInButton = await page.$('button:contains("SIGN IN")') || 
                        await page.$('button[type="submit"]') ||
                        await page.$('#login');
    
    if (signInButton) {
      await signInButton.click();
    } else {
      await page.keyboard.press('Enter');
    }
    
    // Esperar navegación después del login
    console.log('⏳ Waiting for login to complete...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    
    // PASO CRÍTICO: Hacer clic en "Property Management System"
    console.log('🏨 Looking for Property Management System button...');
    try {
      await page.waitForSelector('button:contains("Property Management System"), a:contains("Property Management System")', { timeout: 10000 });
      
      const pmsButton = await page.$('button:contains("Property Management System")') || 
                       await page.$('a:contains("Property Management System")');
      
      if (pmsButton) {
        console.log('✅ Found PMS button, clicking...');
        await pmsButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
      } else {
        console.log('⚠️ PMS button not found, trying direct navigation...');
        await page.goto('https://live.ipms247.com/frontoffice/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });
      }
    } catch (error) {
      console.log('⚠️ Could not find PMS button, assuming already in PMS:', error.message);
    }
    
    // Verificar que estamos logueados
    const currentUrl = page.url();
    console.log('📍 Current URL:', currentUrl);
    
    if (currentUrl.includes('/login')) {
      throw new Error('Login failed - still on login page');
    }
    
    let data = {};
    
    // Extraer reservas
    if (queryType === 'reservations' || queryType === 'general') {
      console.log('📋 Navigating to reservations page...');
      await page.goto(EZEE_URLS.reservations, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Esperar a que carguen las tarjetas de Material-UI
      console.log('⏳ Waiting for reservation cards to load...');
      await page.waitForSelector('.MuiCard-root, .MuiPaper-root', { timeout: 15000 }).catch(() => {
        console.log('⚠️ No MUI cards found, trying alternative selectors...');
      });
      
      await page.waitForTimeout(3000); // Dar tiempo extra para que cargue todo
      
      console.log('📊 Extracting reservation data...');
      const reservations = await page.evaluate(() => {
        // Buscar tarjetas de Material-UI
        const cards = Array.from(document.querySelectorAll('.MuiCard-root, .MuiPaper-root'));
        
        return cards.map(card => {
          // Función auxiliar para extraer texto
          const getText = (selector) => {
            const el = card.querySelector(selector);
            return el ? el.textContent.trim() : '';
          };
          
          // Extraer todos los textos de la tarjeta
          const allText = card.textContent;
          
          // Buscar patrones
          const guestNameMatch = allText.match(/([A-Z][a-z]+\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
          const datesMatch = allText.match(/(\d{2}\/\d{2}\/\d{4})/g);
          const nightsMatch = allText.match(/(\d+)\s*Nights?/i);
          const amountMatch = allText.match(/Me\$\s*([\d,]+\.?\d*)/g);
          const roomMatch = allText.match(/S\s*(\d+)\s*\/\s*([^\/\n]+)/);
          
          return {
            guestName: guestNameMatch ? guestNameMatch[1] : getText('h6, .MuiTypography-h6'),
            bookingId: getText('.MuiTypography-body2'),
            checkIn: datesMatch ? datesMatch[0] : '',
            checkOut: datesMatch ? datesMatch[1] : '',
            nights: nightsMatch ? nightsMatch[1] : getText('.MuiTypography-h4'),
            roomType: roomMatch ? roomMatch[2]?.trim() : '',
            total: amountMatch ? amountMatch[0]?.replace('Me$', '').trim() : '',
            paid: amountMatch ? amountMatch[1]?.replace('Me$', '').trim() : '',
            balance: amountMatch ? amountMatch[2]?.replace('Me$', '').trim() : '',
            rawText: allText.substring(0, 300) // Para debug
          };
        }).filter(res => res.guestName || res.checkIn); // Solo reservas válidas
      });
      
      console.log(`✅ Found ${reservations.length} reservations`);
      data.reservations = reservations;
    }
    
    // Extraer disponibilidad
    if (queryType === 'availability' || queryType === 'general') {
      await page.goto(EZEE_URLS.availability, { waitUntil: 'networkidle2', timeout: 30000 });
      
      const availability = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.map(row => {
          const cells = row.querySelectorAll('td');
          return {
            date: cells[0]?.textContent?.trim() || '',
            roomType: cells[1]?.textContent?.trim() || '',
            available: cells[2]?.textContent?.trim() || '',
            occupied: cells[3]?.textContent?.trim() || '',
            price: cells[4]?.textContent?.trim() || '',
            occupancy: cells[5]?.textContent?.trim() || ''
          };
        });
      });
      
      data.availability = availability;
    }
    
    await page.close();
    
    return {
      success: true,
      type: queryType,
      data: data,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    await page.close();
    throw error;
  }
}

// Endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/scrape', async (req, res) => {
  try {
    const { type = 'general' } = req.body;
    const result = await scrapeEzee(type);
    res.json(result);
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Puppeteer server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Scrape endpoint: POST http://localhost:${PORT}/scrape`);
});

// Cleanup al cerrar
process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});
