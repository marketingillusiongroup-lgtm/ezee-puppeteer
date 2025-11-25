// Módulo completo para scrapear todas las secciones de eZee
// Extrae: Reservations, Arrivals, Departures, In-house, StayView

async function scrapeAllEzee(page) {
  const results = {
    reservations: [],
    arrivals: [],
    departures: [],
    inhouse: [],
    stayview: {
      occupancy: [],
      availability: [],
      stats: {}
    },
    timestamp: new Date().toISOString()
  };

  try {
    console.log('📊 Starting comprehensive eZee scraping...');

    // ==================== RESERVATIONS ====================
    console.log('\n📋 Scraping RESERVATIONS...');
    await page.goto('https://live.ipms247.com/frontoffice/reservations', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Click en tab Reservations
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab'));
      const reservationsTab = tabs.find(tab => tab.textContent.includes('Reservations'));
      if (reservationsTab) reservationsTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.reservations = await page.evaluate(() => {
      const cards = document.querySelectorAll('div[class*="sc-"]');
      const reservations = [];
      
      cards.forEach(card => {
        const text = card.textContent || '';
        
        // Solo procesar si parece una tarjeta de reserva
        if (text.includes('Nights') || text.includes('Booking Date')) {
          reservations.push({
            fullText: text.trim(),
            html: card.innerHTML.substring(0, 5000) // Limitar tamaño
          });
        }
      });
      
      return reservations;
    });
    
    console.log(`✅ Found ${results.reservations.length} reservations`);

    // ==================== ARRIVALS ====================
    console.log('\n✈️ Scraping ARRIVALS...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab'));
      const arrivalsTab = tabs.find(tab => tab.textContent.includes('Arrivals'));
      if (arrivalsTab) arrivalsTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.arrivals = await page.evaluate(() => {
      const cards = document.querySelectorAll('div[class*="sc-"]');
      const arrivals = [];
      
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.includes('Nights') || text.includes('Booking Date')) {
          arrivals.push({
            fullText: text.trim(),
            html: card.innerHTML.substring(0, 5000)
          });
        }
      });
      
      return arrivals;
    });
    
    console.log(`✅ Found ${results.arrivals.length} arrivals`);

    // ==================== DEPARTURES ====================
    console.log('\n🚪 Scraping DEPARTURES...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab'));
      const departuresTab = tabs.find(tab => tab.textContent.includes('Departures'));
      if (departuresTab) departuresTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.departures = await page.evaluate(() => {
      const cards = document.querySelectorAll('div[class*="sc-"]');
      const departures = [];
      
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.includes('Nights') || text.includes('Booking Date')) {
          departures.push({
            fullText: text.trim(),
            html: card.innerHTML.substring(0, 5000)
          });
        }
      });
      
      return departures;
    });
    
    console.log(`✅ Found ${results.departures.length} departures`);

    // ==================== IN-HOUSE ====================
    console.log('\n🏨 Scraping IN-HOUSE...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab'));
      const inhouseTab = tabs.find(tab => tab.textContent.includes('In-house'));
      if (inhouseTab) inhouseTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.inhouse = await page.evaluate(() => {
      const cards = document.querySelectorAll('div[class*="sc-"]');
      const inhouse = [];
      
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.includes('Nights') || text.includes('Booking Date')) {
          inhouse.push({
            fullText: text.trim(),
            html: card.innerHTML.substring(0, 5000)
          });
        }
      });
      
      return inhouse;
    });
    
    console.log(`✅ Found ${results.inhouse.length} in-house guests`);

    // ==================== STAYVIEW ====================
    console.log('\n📅 Scraping STAYVIEW...');
    await page.goto('https://live.ipms247.com/frontoffice/stayview', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    await page.waitForTimeout(5000); // Dar tiempo para que cargue el calendario
    
    const stayviewData = await page.evaluate(() => {
      const data = {
        occupancy: [],
        availability: [],
        roomTypes: [],
        stats: {}
      };
      
      // Extraer estadísticas del header
      try {
        const statElements = document.querySelectorAll('[class*="stat"], .badge, [class*="count"]');
        statElements.forEach(el => {
          const text = el.textContent?.trim();
          if (text) {
            // Intentar identificar el tipo de stat
            const parent = el.closest('div');
            const label = parent?.textContent || '';
            
            if (label.includes('All')) data.stats.all = text;
            if (label.includes('Vacant')) data.stats.vacant = text;
            if (label.includes('Occupied')) data.stats.occupied = text;
            if (label.includes('Reserved')) data.stats.reserved = text;
            if (label.includes('Blocked')) data.stats.blocked = text;
            if (label.includes('Due Out')) data.stats.dueOut = text;
            if (label.includes('Dirty')) data.stats.dirty = text;
          }
        });
      } catch (e) {
        console.error('Error extracting stats:', e);
      }
      
      // Extraer Room Availability
      try {
        const availabilityRow = Array.from(document.querySelectorAll('td.ant-table-cell')).find(
          cell => cell.textContent?.includes('Room Availability')
        );
        
        if (availabilityRow) {
          const row = availabilityRow.closest('tr');
          const cells = row?.querySelectorAll('td.ant-table-cell.occupancy-cell, td.ant-table-cell.ant-table-cell-ellipsis');
          
          cells?.forEach((cell, index) => {
            const value = cell.textContent?.trim();
            if (value && value !== 'N/A' && !isNaN(value)) {
              data.availability.push({
                dayIndex: index,
                available: parseInt(value)
              });
            }
          });
        }
      } catch (e) {
        console.error('Error extracting availability:', e);
      }
      
      // Extraer Occupancy(%)
      try {
        const occupancyRow = Array.from(document.querySelectorAll('td.ant-table-cell')).find(
          cell => cell.textContent?.includes('Occupancy(%)')
        );
        
        if (occupancyRow) {
          const row = occupancyRow.closest('tr');
          const cells = row?.querySelectorAll('td.ant-table-cell.occupancy-cell, td.ant-table-cell.ant-table-cell-ellipsis');
          
          cells?.forEach((cell, index) => {
            const value = cell.textContent?.trim();
            if (value && value !== 'N/A' && !isNaN(value)) {
              data.occupancy.push({
                dayIndex: index,
                percentage: parseInt(value)
              });
            }
          });
        }
      } catch (e) {
        console.error('Error extracting occupancy:', e);
      }
      
      // Extraer tipos de habitaciones
      try {
        const roomRows = document.querySelectorAll('div.ant-row');
        roomRows.forEach(row => {
          const text = row.textContent?.trim();
          if (text && (text.startsWith('S ') || text.includes('Individual') || text.includes('Suite'))) {
            data.roomTypes.push(text);
          }
        });
      } catch (e) {
        console.error('Error extracting room types:', e);
      }
      
      return data;
    });
    
    results.stayview = stayviewData;
    console.log(`✅ StayView data extracted`);
    console.log(`   - Occupancy points: ${stayviewData.occupancy.length}`);
    console.log(`   - Availability points: ${stayviewData.availability.length}`);
    console.log(`   - Room types: ${stayviewData.roomTypes.length}`);
    console.log(`   - Stats:`, stayviewData.stats);

    return {
      success: true,
      data: results
    };

  } catch (error) {
    console.error('❌ Error in scrapeAllEzee:', error);
    return {
      success: false,
      error: error.message,
      data: results // Devolver lo que se pudo extraer
    };
  }
}

module.exports = { scrapeAllEzee };
