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
    
    // NUEVA ESTRATEGIA: Hacer click en cada tarjeta y extraer del popup
    console.log('🔍 Finding reservation cards...');
    
    // Obtener todas las tarjetas de reserva
    const cardHandles = await page.$$('div.sc-kvxsdh.cczCye');
    console.log(`📦 Found ${cardHandles.length} reservation cards`);
    
    results.reservations = [];
    
    for (let i = 0; i < cardHandles.length; i++) {
      try {
        console.log(`\n📋 Processing reservation ${i + 1}/${cardHandles.length}...`);
        
        // Obtener la tarjeta nuevamente (por si el DOM cambió)
        const cards = await page.$$('div.sc-kvxsdh.cczCye');
        if (i >= cards.length) break;
        
        const card = cards[i];
        
        // 1. Extraer "noches" de la tarjeta ANTES de hacer click
        let noches = 0;
        try {
          const nightsElement = await card.$('div.ant-col.ant-col-4.sc-hmlNyy.Ino kim');
          if (nightsElement) {
            const nightsText = await page.evaluate(el => el.textContent, nightsElement);
            const nightsMatch = nightsText.match(/(\d+)\s*Nights?/i);
            if (nightsMatch) {
              noches = parseInt(nightsMatch[1]);
              console.log(`   ✅ Nights extracted: ${noches}`);
            }
          }
        } catch (e) {
          console.log(`   ⚠️ Could not extract nights from card: ${e.message}`);
        }
        
        // 2. Hacer click en la tarjeta para abrir el popup
        await card.click();
        await page.waitForTimeout(1500); // Esperar a que se abra el popup
        
        // 3. Extraer todos los datos del popup
        const reservationData = await page.evaluate(() => {
          const data = {
            nombre: null,
            telefono: null,
            correo: null,
            reservationNumber: null,
            voucherNumber: null,
            arrivalDate: null,
            departureDate: null,
            bookingDate: null,
            status: null,
            roomType: null,
            roomNumber: null,
            adultos: 0,
            ninos: 0,
            total: 0,
            paid: 0,
            balance: 0
          };
          
          try {
            // NOMBRE: Buscar span más grande (18px) cerca del inicio
            const allSpans = Array.from(document.querySelectorAll('span'));
            for (const span of allSpans) {
              const style = window.getComputedStyle(span);
              const fontSize = style.fontSize;
              const text = span.textContent?.trim() || '';
              if (fontSize === '18px' && text.length > 3 && text.length < 80 && /^[A-Z]/.test(text)) {
                // Verificar que no sea un elemento de UI
                if (!text.match(/^(Reservation|Voucher|Booking|Arrival|Departure|Room|Total|Paid|Balance)/i)) {
                  data.nombre = text;
                  break;
                }
              }
            }
            
            // CORREO: Selector específico
            const emailEl = document.querySelector('span.sc-bHDJZS.gGRMfe');
            if (emailEl) {
              data.correo = emailEl.textContent?.trim() || null;
            }
            
            // TELÉFONO: Buscar span con teléfono (12px, #666666, junto a ícono)
            for (const span of allSpans) {
              const style = window.getComputedStyle(span);
              const color = style.color;
              const text = span.textContent?.trim() || '';
              // Buscar formato de teléfono
              if (text.match(/\+?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/) && 
                  (color.includes('102, 102, 102') || color.includes('666666'))) {
                data.telefono = text;
                break;
              }
            }
            
            // FECHAS: span.sc-csvytd.bYxtBL (3 elementos: Arrival, Departure, Booking)
            const dateElements = Array.from(document.querySelectorAll('span.sc-csvytd.bYxtBL'));
            if (dateElements.length >= 1) {
              data.arrivalDate = dateElements[0].textContent?.trim() || null;
            }
            if (dateElements.length >= 2) {
              data.departureDate = dateElements[1].textContent?.trim() || null;
            }
            if (dateElements.length >= 3) {
              data.bookingDate = dateElements[2].textContent?.trim() || null;
            }
            
            // RESERVATION NUMBER, VOUCHER NUMBER, ROOM TYPE: div.sc-eJHOIC.jnnoOL
            const infoElements = Array.from(document.querySelectorAll('div.sc-eJHOIC.jnnoOL'));
            for (const el of infoElements) {
              const text = el.textContent?.trim() || '';
              
              // Reservation Number: solo números o formato "3439"
              if (/^\d+$/.test(text) && text.length >= 3 && text.length <= 6) {
                data.reservationNumber = text;
              }
              // Voucher Number: formato con "/" o "-"
              else if (text.match(/[\d-]+\/[\d-]+/)) {
                data.voucherNumber = text;
              }
              // Room Type/Number: contiene "S " o "Room"
              else if (text.match(/S\s*\d+|Room|Individual|Compartida|Privada/i)) {
                // Separar Room Type y Room Number
                const roomMatch = text.match(/S\s*(\d+)/i);
                if (roomMatch) {
                  data.roomNumber = `S ${roomMatch[1]}`;
                }
                // Room Type es el texto completo sin el número
                const roomTypeText = text.replace(/S\s*\d+/i, '').trim();
                if (roomTypeText) {
                  data.roomType = roomTypeText;
                } else {
                  data.roomType = text;
                }
              }
            }
            
            // STATUS: div.sc-ivTmOn.cXSEyG
            const statusEl = document.querySelector('div.sc-ivTmOn.cXSEyG');
            if (statusEl) {
              const statusText = statusEl.textContent?.trim() || '';
              if (statusText.toLowerCase().includes('confirm')) {
                data.status = 'confirmed';
              } else if (statusText.toLowerCase().includes('pending')) {
                data.status = 'pending';
              } else if (statusText.toLowerCase().includes('check-in')) {
                data.status = 'checked-in';
              } else if (statusText.toLowerCase().includes('check-out')) {
                data.status = 'checked-out';
              } else if (statusText.toLowerCase().includes('cancel')) {
                data.status = 'cancelled';
              } else {
                data.status = statusText.toLowerCase();
              }
            }
            
            // PERSONAS (Adults/Children): div.sc-cvnuvz.hZreah
            const paxEl = document.querySelector('div.sc-cvnuvz.hZreah');
            if (paxEl) {
              const paxText = paxEl.textContent || '';
              // Buscar números en el texto (formato: "2 0" o similar)
              const numbers = paxText.match(/\d+/g);
              if (numbers && numbers.length >= 1) {
                data.adultos = parseInt(numbers[0]) || 0;
              }
              if (numbers && numbers.length >= 2) {
                data.ninos = parseInt(numbers[1]) || 0;
              }
            }
            
            // TOTAL, PAID, BALANCE: div.ant-col.ant-col-12
            const financialElements = Array.from(document.querySelectorAll('div.ant-col.ant-col-12'));
            for (const el of financialElements) {
              const text = el.textContent?.trim() || '';
              const style = window.getComputedStyle(el);
              const color = style.color;
              
              // Buscar por contexto (texto padre) o color
              const parentText = el.parentElement?.textContent || '';
              
              if (text.includes('Mex$') || text.includes('Me$')) {
                const amountMatch = text.match(/[\d,]+\.?\d*/);
                if (amountMatch) {
                  const amount = parseFloat(amountMatch[0].replace(/,/g, ''));
                  
                  // Balance es rojo (#FF5353)
                  if (color.includes('255, 83, 83') || color.includes('FF5353')) {
                    data.balance = amount;
                  }
                  // Total y Paid por contexto
                  else if (parentText.includes('Total') || text.includes('Total')) {
                    data.total = amount;
                  }
                  else if (parentText.includes('Paid') || text.includes('Paid')) {
                    data.paid = amount;
                  }
                }
              }
            }
            
          } catch (error) {
            console.error('Error extracting popup data:', error);
          }
          
          return data;
        });
        
        // 4. Agregar noches extraídas de la tarjeta
        reservationData.noches = noches;
        reservationData.personas = reservationData.adultos + reservationData.ninos;
        
        // 5. Cerrar el popup (buscar botón X o presionar ESC)
        try {
          const closeButton = await page.$('button[aria-label="Close"], button:has-text("×"), [class*="close"], [class*="Close"]');
          if (closeButton) {
            await closeButton.click();
          } else {
            // Intentar presionar ESC
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(500);
        } catch (e) {
          console.log(`   ⚠️ Could not close popup: ${e.message}`);
          // Intentar ESC de todas formas
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
        
        // 6. Agregar a resultados
        if (reservationData.nombre || reservationData.reservationNumber) {
          results.reservations.push({
            nombre: reservationData.nombre || 'Unknown',
            telefono: reservationData.telefono,
            correo: reservationData.correo,
            bookingId: reservationData.reservationNumber ? 
              (reservationData.voucherNumber ? 
                `${reservationData.reservationNumber} | ${reservationData.voucherNumber}` : 
                reservationData.reservationNumber) : null,
            reservationNumber: reservationData.reservationNumber,
            voucherNumber: reservationData.voucherNumber,
            checkInDate: reservationData.arrivalDate ? reservationData.arrivalDate.split(' ')[0] : null,
            checkOutDate: reservationData.departureDate ? reservationData.departureDate.split(' ')[0] : null,
            checkInTime: reservationData.arrivalDate ? reservationData.arrivalDate.split(' ').slice(1).join(' ') : null,
            checkOutTime: reservationData.departureDate ? reservationData.departureDate.split(' ').slice(1).join(' ') : null,
            bookingDate: reservationData.bookingDate ? reservationData.bookingDate.split(' ')[0] : null,
            noches: reservationData.noches,
            adultos: reservationData.adultos,
            ninos: reservationData.ninos,
            personas: reservationData.personas,
            habitacion: reservationData.roomNumber || reservationData.roomType,
            roomType: reservationData.roomType,
            roomNumber: reservationData.roomNumber,
            total: reservationData.total,
            paid: reservationData.paid,
            balance: reservationData.balance,
            status: reservationData.status || 'pending'
          });
          console.log(`   ✅ Reservation extracted: ${reservationData.nombre || reservationData.reservationNumber}`);
        } else {
          console.log(`   ⚠️ Skipped reservation ${i + 1} (no valid data)`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error processing reservation ${i + 1}:`, error.message);
        // Intentar cerrar popup si está abierto
        try {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        } catch (e) {}
      }
    }
    
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
      // TODO: Implementar scraping de arrivals con la misma estrategia (click en tarjetas)
      // Por ahora retornar array vacío
      return [];
    });
    
    console.log(`✅ Found ${results.arrivals.length} arrivals`);

    // ==================== DEPARTURES ====================
    console.log('\n✈️ Scraping DEPARTURES...');
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('div.ant-tabs-tab, button[role="tab"]'));
      const departuresTab = tabs.find(tab => tab.textContent.includes('Departures'));
      if (departuresTab) departuresTab.click();
    });
    
    await page.waitForTimeout(3000);
    
    results.departures = await page.evaluate(() => {
      // TODO: Implementar scraping de departures con la misma estrategia (click en tarjetas)
      // Por ahora retornar array vacío
      return [];
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
      // TODO: Implementar scraping de inhouse con la misma estrategia (click en tarjetas)
      // Por ahora retornar array vacío
      return [];
    });
    
    console.log(`✅ Found ${results.inhouse.length} in-house reservations`);

    // ==================== STAYVIEW ====================
    console.log('\n📊 Scraping STAYVIEW...');
    await page.goto('https://live.ipms247.com/frontoffice/stayview', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    await page.waitForTimeout(3000);
    
    const stayviewData = await page.evaluate(() => {
      const data = {
        occupancy: [],
        availability: [],
        stats: {}
      };
      
      // Extraer Availability
      try {
        const availabilityRow = Array.from(document.querySelectorAll('td.ant-table-cell')).find(
          cell => cell.textContent?.includes('Availability')
        );
        
        if (availabilityRow) {
          const row = availabilityRow.closest('tr');
          const cells = row?.querySelectorAll('td.ant-table-cell.availability-cell, td.ant-table-cell.ant-table-cell-ellipsis');
          
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

