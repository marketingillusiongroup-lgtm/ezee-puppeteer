const express = require('express');
const puppeteer = require('puppeteer');
require('dotenv').config();
const { scrapeStayView } = require('./scrape-stayview');
const { scrapeAllEzee } = require('./scrape-all-ezee');
const { scrapeAllEzeeImproved } = require('./scrape-all-ezee-improved');

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
      
      console.log('📊 Extracting page content...');
      
      // Extraer el contenido completo de la página para que la IA lo procese
      const pageData = await page.evaluate(() => {
        // Obtener el contenedor principal
        const mainContent = document.querySelector('main, #root, .MuiContainer-root') || document.body;
        
        // Extraer texto limpio
        const textContent = mainContent.textContent.replace(/\s+/g, ' ').trim();
        
        // Contar elementos que parecen reservas
        const cards = document.querySelectorAll('.MuiCard-root, .MuiPaper-root, [class*="card"]');
        
        return {
          html: mainContent.innerHTML.substring(0, 50000), // Limitar tamaño
          text: textContent.substring(0, 10000), // Texto limpio
          cardCount: cards.length,
          url: window.location.href,
          title: document.title
        };
      });
      
      console.log(`✅ Extracted page data (${pageData.cardCount} cards found)`);
      data.reservations = pageData;
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

// Endpoint específico para StayView (optimizado)
app.post('/scrape-stayview', async (req, res) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    console.log('🔐 Starting StayView scraping...');
    
    // Configurar página
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Login
    console.log('📄 Loading login page...');
    await page.goto(EZEE_URLS.login, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input#username', { timeout: 15000 });
    
    console.log('✍️ Filling login form...');
    await page.type('input#username', EZEE_CREDENTIALS.username);
    await page.type('input#password', EZEE_CREDENTIALS.password);
    await page.type('input#hotelcode', EZEE_CREDENTIALS.propertyCode);
    
    console.log('🔑 Logging in...');
    await page.click('button#login');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    
    // Click PMS button
    console.log('🏨 Clicking PMS button...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const pmsButton = buttons.find(btn => btn.textContent.trim() === 'Property Management System');
      if (pmsButton) pmsButton.click();
    });
    await page.waitForTimeout(3000);
    
    // Navegar a StayView
    console.log('📅 Navigating to StayView...');
    await page.goto(EZEE_URLS.availability, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForTimeout(5000); // Dar tiempo para que cargue el calendario
    
    // Usar la función optimizada de scraping
    console.log('📊 Extracting StayView data...');
    const stayViewData = await scrapeStayView(page);
    
    await page.close();
    
    res.json({
      success: true,
      ...stayViewData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('StayView scraping error:', error);
    await page.close();
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint COMPLETO - Scrapea TODO de eZee (Recomendado para n8n)
app.post('/scrape-all', async (req, res) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    console.log('🚀 Starting COMPLETE eZee scraping...');
    
    // Configurar página
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Login
    console.log('📄 Loading login page...');
    await page.goto(EZEE_URLS.login, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input#username', { timeout: 15000 });
    
    console.log('✍️ Filling login form...');
    await page.type('input#username', EZEE_CREDENTIALS.username);
    await page.type('input#password', EZEE_CREDENTIALS.password);
    await page.type('input#hotelcode', EZEE_CREDENTIALS.propertyCode);
    
    console.log('🔑 Logging in...');
    await page.click('button#login');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    
    // Click PMS button
    console.log('🏨 Clicking PMS button...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const pmsButton = buttons.find(btn => btn.textContent.trim() === 'Property Management System');
      if (pmsButton) pmsButton.click();
    });
    await page.waitForTimeout(3000);
    
    // Usar la función completa de scraping
    console.log('📊 Extracting ALL data from eZee (IMPROVED)...');
    const allData = await scrapeAllEzeeImproved(page);
    
    await page.close();
    
    res.json({
      ...allData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Complete scraping error:', error);
    await page.close();
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

