// Módulo MEJORADO para scrapear todas las secciones de eZee
// Extrae datos ESTRUCTURADOS directamente del DOM (no HTML/texto crudo)
// Esto reduce el tamaño de datos y facilita el procesamiento

async function scrapeAllEzeeImproved(page) {
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
    console.log('📊 Starting comprehensive eZee scraping (IMPROVED)...');


    // ==================== RESERVATIONS ====================
    console.log('\n📋 Scraping RESERVATIONS...');
    await page.goto('https://live.ipms247.com/frontoffice/reservations', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Click en tab Reservations
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const reservationsTab = tabs.find(tab => tab.textContent.includes('Reservations'));
      if (reservationsTab) reservationsTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.reservations = await page.evaluate(() => {
      // Función para extraer una reserva estructurada de una tarjeta
      const extractReservation = (card) => {
        try {
          // Extraer nombre del huésped
          const nameElement = card.querySelector('h6, .MuiTypography-h6, [class*="Typography-h6"]');
          let nombre = nameElement?.textContent?.trim() || '';
          
          // Si no hay nombre en h6, buscar en el texto completo
          if (!nombre || nombre.length < 3) {
            const allText = card.textContent || '';
            // Buscar patrones de nombres (palabras con mayúsculas seguidas)
            const nameMatch = allText.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
            if (nameMatch) {
              nombre = nameMatch[0].trim();
            } else {
              // Buscar primera línea que parezca un nombre
              const lines = allText.split('\n').filter(l => l.trim());
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.length > 5 && trimmed.length < 50 && /^[A-Z]/.test(trimmed)) {
                  // Verificar que no sea una fecha, número, etc.
                  if (!trimmed.match(/^\d|Booking|Total|Paid|Balance|Nights|Room|Date/i)) {
                    nombre = trimmed;
                    break;
                  }
                }
              }
            }
          }

          // Extraer booking ID
          const bookingIdElements = card.querySelectorAll('.MuiTypography-body2, [class*="Typography-body2"]');
          let bookingId = '';
          for (const el of bookingIdElements) {
            const text = el.textContent?.trim() || '';
            if (text.match(/\d+\s*[|]\s*[A-Z0-9/]+/)) {
              bookingId = text;
              break;
            }
          }

          // Extraer fechas
          const allText = card.textContent || '';
          const dateMatches = allText.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
          const checkInDate = dateMatches[0] || null;
          const checkOutDate = dateMatches[1] || null;
          const bookingDate = dateMatches[2] || null;

          // Extraer horas
          const timeMatches = allText.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/gi) || [];
          const checkInTime = timeMatches[0] || null;
          const checkOutTime = timeMatches[1] || null;

          // Extraer noches
          const nightsMatch = allText.match(/(\d+)\s*Nights?/i);
          const noches = nightsMatch ? parseInt(nightsMatch[1]) : 0;

          // Extraer adultos y niños
          const adultsMatch = allText.match(/(\d+)\s*(?:Adults?|Adult)/i);
          const childrenMatch = allText.match(/(\d+)\s*(?:Child|Children)/i);
          const adultos = adultsMatch ? parseInt(adultsMatch[1]) : 0;
          const ninos = childrenMatch ? parseInt(childrenMatch[1]) : 0;
          const personas = adultos + ninos;

          // Extraer habitación
          const roomMatch = allText.match(/S\s*(\d+)/i) || allText.match(/Room\s*Type[^/]*\/\s*([^/]+)/i);
          const habitacion = roomMatch ? (roomMatch[0].includes('S ') ? `S ${roomMatch[1]}` : roomMatch[1].trim()) : null;

          // Extraer montos (mejorado para capturar diferentes formatos)
          const totalMatch = allText.match(/Total[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Total[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const paidMatch = allText.match(/Paid[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Paid[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          const balanceMatch = allText.match(/Balance[^\d]*([\d,]+\.?\d*)/i) || allText.match(/Balance[^M]*Me?\$?\s*([\d,]+\.?\d*)/i);
          
          const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;
          const paid = paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0;
          const balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0;

          // Extraer estado
          const statusText = allText.toLowerCase();
          let status = 'pending';
          if (statusText.includes('confirm')) status = 'confirmed';
          if (statusText.includes('check-in')) status = 'checked-in';
          if (statusText.includes('check-out')) status = 'checked-out';
          if (statusText.includes('cancel')) status = 'cancelled';

          // Validar que tenemos al menos nombre o booking ID
          if (!nombre && !bookingId) {
            return null; // No es una reserva válida
          }

          return {
            nombre: nombre || 'Unknown',
            bookingId: bookingId || null,
            checkInDate,
            checkOutDate,
            checkInTime,
            checkOutTime,
            bookingDate,
            noches,
            adultos,
            ninos,
            personas,
            habitacion,
            total,
            paid,
            balance,
            status,
            rawText: allText.substring(0, 500) // Solo para debugging, limitado
          };
        } catch (error) {
          console.error('Error extrayendo reserva:', error);
          return null;
        }
      };
      
      // Buscar tarjetas de reserva
      const cards = Array.from(document.querySelectorAll('div[class*="sc-"], .MuiCard-root, .MuiPaper-root'));
      const reservations = [];
      
      cards.forEach(card => {
        const text = card.textContent || '';
        
        // Solo procesar si parece una tarjeta de reserva
        if (text.includes('Nights') || text.includes('Booking Date') || text.includes('Total') || text.includes('Check')) {
          // Extraer datos estructurados
          const reservation = extractReservation(card);
          if (reservation) {
            reservations.push(reservation);
          }
        }
      });
      
      return reservations;
    });
    
    console.log(`✅ Found ${results.reservations.length} reservations`);

    // ==================== ARRIVALS ====================
    console.log('\n✈️ Scraping ARRIVALS...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const arrivalsTab = tabs.find(tab => tab.textContent.includes('Arrivals'));
      if (arrivalsTab) arrivalsTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.arrivals = await page.evaluate(() => {
      // (Misma función extractReservation que arriba, copiada aquí para evitar duplicación)
      const extractReservation = (card) => {
        try {
          const nameElement = card.querySelector('h6, .MuiTypography-h6, [class*="Typography-h6"]');
          let nombre = nameElement?.textContent?.trim() || '';
          if (!nombre || nombre.length < 3) {
            const allText = card.textContent || '';
            const nameMatch = allText.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
            if (nameMatch) nombre = nameMatch[0].trim();
          }
          const allText = card.textContent || '';
          const dateMatches = allText.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
          const nightsMatch = allText.match(/(\d+)\s*Nights?/i);
          const adultsMatch = allText.match(/(\d+)\s*(?:Adults?|Adult)/i);
          const childrenMatch = allText.match(/(\d+)\s*(?:Child|Children)/i);
          const roomMatch = allText.match(/S\s*(\d+)/i);
          const totalMatch = allText.match(/Total[^\d]*([\d,]+\.?\d*)/i);
          const paidMatch = allText.match(/Paid[^\d]*([\d,]+\.?\d*)/i);
          const balanceMatch = allText.match(/Balance[^\d]*([\d,]+\.?\d*)/i);
          if (!nombre) return null;
          return {
            nombre: nombre || 'Unknown',
            checkInDate: dateMatches[0] || null,
            checkOutDate: dateMatches[1] || null,
            bookingDate: dateMatches[2] || null,
            noches: nightsMatch ? parseInt(nightsMatch[1]) : 0,
            adultos: adultsMatch ? parseInt(adultsMatch[1]) : 0,
            ninos: childrenMatch ? parseInt(childrenMatch[1]) : 0,
            personas: (adultsMatch ? parseInt(adultsMatch[1]) : 0) + (childrenMatch ? parseInt(childrenMatch[1]) : 0),
            habitacion: roomMatch ? `S ${roomMatch[1]}` : null,
            total: totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0,
            paid: paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0,
            balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
            status: allText.toLowerCase().includes('confirm') ? 'confirmed' : 'pending'
          };
        } catch (e) { return null; }
      };
      const cards = Array.from(document.querySelectorAll('div[class*="sc-"], .MuiCard-root, .MuiPaper-root'));
      const arrivals = [];
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.includes('Nights') || text.includes('Booking Date')) {
          const reservation = extractReservation(card);
          if (reservation) arrivals.push(reservation);
        }
      });
      return arrivals;
    });
    
    console.log(`✅ Found ${results.arrivals.length} arrivals`);

    // ==================== DEPARTURES ====================
    console.log('\n🚪 Scraping DEPARTURES...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const departuresTab = tabs.find(tab => tab.textContent.includes('Departures'));
      if (departuresTab) departuresTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.departures = await page.evaluate(() => {
      const extractReservation = (card) => {
        try {
          const nameElement = card.querySelector('h6, .MuiTypography-h6');
          let nombre = nameElement?.textContent?.trim() || '';
          if (!nombre) {
            const allText = card.textContent || '';
            const nameMatch = allText.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
            if (nameMatch) nombre = nameMatch[0].trim();
          }
          const allText = card.textContent || '';
          const dateMatches = allText.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
          const nightsMatch = allText.match(/(\d+)\s*Nights?/i);
          const adultsMatch = allText.match(/(\d+)\s*(?:Adults?|Adult)/i);
          const childrenMatch = allText.match(/(\d+)\s*(?:Child|Children)/i);
          const roomMatch = allText.match(/S\s*(\d+)/i);
          const totalMatch = allText.match(/Total[^\d]*([\d,]+\.?\d*)/i);
          const paidMatch = allText.match(/Paid[^\d]*([\d,]+\.?\d*)/i);
          const balanceMatch = allText.match(/Balance[^\d]*([\d,]+\.?\d*)/i);
          if (!nombre) return null;
          return {
            nombre: nombre || 'Unknown',
            checkInDate: dateMatches[0] || null,
            checkOutDate: dateMatches[1] || null,
            bookingDate: dateMatches[2] || null,
            noches: nightsMatch ? parseInt(nightsMatch[1]) : 0,
            adultos: adultsMatch ? parseInt(adultsMatch[1]) : 0,
            ninos: childrenMatch ? parseInt(childrenMatch[1]) : 0,
            personas: (adultsMatch ? parseInt(adultsMatch[1]) : 0) + (childrenMatch ? parseInt(childrenMatch[1]) : 0),
            habitacion: roomMatch ? `S ${roomMatch[1]}` : null,
            total: totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0,
            paid: paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0,
            balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
            status: allText.toLowerCase().includes('confirm') ? 'confirmed' : 'pending'
          };
        } catch (e) { return null; }
      };
      const cards = Array.from(document.querySelectorAll('div[class*="sc-"], .MuiCard-root, .MuiPaper-root'));
      const departures = [];
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.includes('Nights') || text.includes('Booking Date')) {
          const reservation = extractReservation(card);
          if (reservation) departures.push(reservation);
        }
      });
      return departures;
    });
    
    console.log(`✅ Found ${results.departures.length} departures`);

    // ==================== IN-HOUSE ====================
    console.log('\n🏨 Scraping IN-HOUSE...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const inhouseTab = tabs.find(tab => tab.textContent.includes('In-house'));
      if (inhouseTab) inhouseTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.inhouse = await page.evaluate(() => {
      const extractReservation = (card) => {
        try {
          const nameElement = card.querySelector('h6, .MuiTypography-h6');
          let nombre = nameElement?.textContent?.trim() || '';
          if (!nombre) {
            const allText = card.textContent || '';
            const nameMatch = allText.match(/(?:Mr\.|Ms\.|Mrs\.|Dr\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})/);
            if (nameMatch) nombre = nameMatch[0].trim();
          }
          const allText = card.textContent || '';
          const dateMatches = allText.match(/(\d{2}\/\d{2}\/\d{4})/g) || [];
          const nightsMatch = allText.match(/(\d+)\s*Nights?/i);
          const adultsMatch = allText.match(/(\d+)\s*(?:Adults?|Adult)/i);
          const childrenMatch = allText.match(/(\d+)\s*(?:Child|Children)/i);
          const roomMatch = allText.match(/S\s*(\d+)/i);
          const totalMatch = allText.match(/Total[^\d]*([\d,]+\.?\d*)/i);
          const paidMatch = allText.match(/Paid[^\d]*([\d,]+\.?\d*)/i);
          const balanceMatch = allText.match(/Balance[^\d]*([\d,]+\.?\d*)/i);
          if (!nombre) return null;
          return {
            nombre: nombre || 'Unknown',
            checkInDate: dateMatches[0] || null,
            checkOutDate: dateMatches[1] || null,
            bookingDate: dateMatches[2] || null,
            noches: nightsMatch ? parseInt(nightsMatch[1]) : 0,
            adultos: adultsMatch ? parseInt(adultsMatch[1]) : 0,
            ninos: childrenMatch ? parseInt(childrenMatch[1]) : 0,
            personas: (adultsMatch ? parseInt(adultsMatch[1]) : 0) + (childrenMatch ? parseInt(childrenMatch[1]) : 0),
            habitacion: roomMatch ? `S ${roomMatch[1]}` : null,
            total: totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0,
            paid: paidMatch ? parseFloat(paidMatch[1].replace(/,/g, '')) : 0,
            balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
            status: allText.toLowerCase().includes('confirm') ? 'confirmed' : 'pending'
          };
        } catch (e) { return null; }
      };
      const cards = Array.from(document.querySelectorAll('div[class*="sc-"], .MuiCard-root, .MuiPaper-root'));
      const inhouse = [];
      cards.forEach(card => {
        const text = card.textContent || '';
        if (text.includes('Nights') || text.includes('Booking Date')) {
          const reservation = extractReservation(card);
          if (reservation) inhouse.push(reservation);
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
    
    await page.waitForTimeout(5000);
    
    const stayviewData = await page.evaluate(() => {
      const data = {
        occupancy: [],
        availability: [],
        stats: {}
      };
      
      // Extraer estadísticas del header
      try {
        const statElements = document.querySelectorAll('[class*="stat"], .badge, [class*="count"]');
        const allStatsText = Array.from(statElements).map(el => el.textContent?.trim()).join(' ');
        
        // Extraer números de las estadísticas
        const allMatch = allStatsText.match(/All[^\d]*(\d+)/i);
        const vacantMatch = allStatsText.match(/Vacant[^\d]*(\d+)/i);
        const occupiedMatch = allStatsText.match(/Occupied[^\d]*(\d+)/i);
        const reservedMatch = allStatsText.match(/Reserved[^\d]*(\d+)/i);
        const blockedMatch = allStatsText.match(/Blocked[^\d]*(\d+)/i);
        const dueOutMatch = allStatsText.match(/Due\s*Out[^\d]*(\d+)/i);
        const dirtyMatch = allStatsText.match(/Dirty[^\d]*(\d+)/i);
        
        data.stats = {
          all: allMatch ? parseInt(allMatch[1]) : 0,
          vacant: vacantMatch ? parseInt(vacantMatch[1]) : 0,
          occupied: occupiedMatch ? parseInt(occupiedMatch[1]) : 0,
          reserved: reservedMatch ? parseInt(reservedMatch[1]) : 0,
          blocked: blockedMatch ? parseInt(blockedMatch[1]) : 0,
          dueOut: dueOutMatch ? parseInt(dueOutMatch[1]) : 0,
          dirty: dirtyMatch ? parseInt(dirtyMatch[1]) : 0
        };
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
      
      return data;
    });
    
    results.stayview = stayviewData;
    console.log(`✅ StayView data extracted`);
    console.log(`   - Occupancy points: ${stayviewData.occupancy.length}`);
    console.log(`   - Availability points: ${stayviewData.availability.length}`);
    console.log(`   - Stats:`, stayviewData.stats);

    return {
      success: true,
      data: results
    };

  } catch (error) {
    console.error('❌ Error in scrapeAllEzeeImproved:', error);
    return {
      success: false,
      error: error.message,
      data: results
    };
  }
}

module.exports = { scrapeAllEzeeImproved };

