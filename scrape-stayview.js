// Módulo para scrapear StayView de eZee (ocupación y disponibilidad)

async function scrapeStayView(page) {
  try {
    const data = {
      occupancy: [],
      availability: [],
      roomTypes: [],
      stats: {}
    };
    
    // Extraer estadísticas del header
    try {
      const statElements = await page.$$('[class*="stat"], .badge, [class*="count"]');
      for (const el of statElements) {
        const text = await el.evaluate(node => node.textContent?.trim());
        if (text) {
          const parent = await el.evaluateHandle(node => node.closest('div'));
          const label = await parent.evaluate(node => node.textContent || '');
          
          if (label.includes('All')) data.stats.all = text;
          if (label.includes('Vacant')) data.stats.vacant = text;
          if (label.includes('Occupied')) data.stats.occupied = text;
          if (label.includes('Reserved')) data.stats.reserved = text;
          if (label.includes('Blocked')) data.stats.blocked = text;
          if (label.includes('Due Out')) data.stats.dueOut = text;
          if (label.includes('Dirty')) data.stats.dirty = text;
        }
      }
    } catch (e) {
      console.error('Error extracting stats:', e);
    }
    
    return {
      success: true,
      data: data
    };
    
  } catch (error) {
    console.error('Error in scrapeStayView:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { scrapeStayView };
