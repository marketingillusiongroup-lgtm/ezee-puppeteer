const express = require('express');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración
const PORT = process.env.PORT || 3000;

// Validar que las credenciales estén configuradas
if (!process.env.EZEE_USERNAME || !process.env.EZEE_PASSWORD || !process.env.EZEE_PROPERTY_CODE) {
  console.error('❌ ERROR: Missing eZee credentials in environment variables');
  console.error('Please set: EZEE_USERNAME, EZEE_PASSWORD, EZEE_PROPERTY_CODE');
  process.exit(1);
}

const EZEE_CREDENTIALS = {
  username: process.env.EZEE_USERNAME,
  password: process.env.EZEE_PASSWORD,
  propertyCode: process.env.EZEE_PROPERTY_CODE
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
    
    // Esperar formulario - usar selectores exactos que funcionaron
    console.log('⏳ Waiting for login form...');
    await page.waitForSelector('input#username', { timeout: 15000 });
    
    // Llenar formulario con selectores exactos
    console.log('✍️ Filling login form...');
    await page.type('input#username', EZEE_CREDENTIALS.username);
    console.log('  ✅ Username filled');
    
    await page.type('input#password', EZEE_CREDENTIALS.password);
    console.log('  ✅ Password filled');
    
    await page.type('input#hotelcode', EZEE_CREDENTIALS.propertyCode);
    console.log('  ✅ Property code filled');
    
    // Login - usar el selector exacto que funcionó
    console.log('🔑 Clicking SIGN IN...');
    await page.click('button#login');
    console.log('✅ SIGN IN clicked');
    
    // Esperar navegación después del login
    console.log('⏳ Waiting for login to complete...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    
    // PASO CRÍTICO: Hacer clic en "Property Management System"
    console.log('🏨 Looking for Property Management System button...');
    try {
      await page.waitForTimeout(3000); // Esperar a que cargue la página
      
      // Buscar y hacer click usando evaluate (más confiable)
      const pmsClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const pmsButton = buttons.find(btn => 
          btn.textContent.trim() === 'Property Management System'
        );
        if (pmsButton) {
          pmsButton.click();
          return true;
        }
        return false;
      });
      
      if (pmsClicked) {
        console.log('✅ PMS button clicked');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
      } else {
        console.log('⚠️ PMS button not found, trying direct navigation...');
        await page.goto('https://live.ipms247.com/frontoffice/reservations', { 
          waitUntil: 'networkidle2', 
          timeout: 30000 
        });
      }
    } catch (error) {
      console.log('⚠️ Error with PMS button:', error.message);
      // Intentar navegación directa
      await page.goto('https://live.ipms247.com/frontoffice/reservations', { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
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
