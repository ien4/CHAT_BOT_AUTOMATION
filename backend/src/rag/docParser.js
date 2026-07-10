const fs = require('fs').promises;
const path = require('path');
const net = require('net');
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Document Parser
 * Handles parsing of various document formats for knowledge base ingestion
 * Supports: JSON, TXT, PDF, DOCX, Website scraping
 */
class DocParser {
  constructor() {
    this.uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  }

  /**
   * Ensure uploads directory exists
   */
  async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadsDir, { recursive: true });
    } catch (error) {
      // Directory already exists, ignore
    }
  }

  /**
   * Parse a file based on its extension
   * @param {string} filePath - Path to the uploaded file
   * @returns {Promise<{title: string, content: string}>}
   */
  async parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.json':
        return this.parseJson(filePath);
      case '.txt':
      case '.md':
        return this.parseText(filePath);
      case '.pdf':
        return this.parsePdf(filePath);
      case '.docx':
        return this.parseDocx(filePath);
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  /**
   * Parse JSON knowledge file
   * Expected format: { items: [{ title, content, category }] }
   * Or: single { title, content, category }
   */
  async parseJson(filePath) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);

      const items = data.items || (Array.isArray(data) ? data : [data]);

      return items.map(item => ({
        title: item.title || 'Untitled',
        content: item.content || '',
        category: item.category || 'general',
      }));
    } catch (error) {
      throw new Error(`JSON parse error: ${error.message}`);
    }
  }

  /**
   * Parse plain text file
   */
  async parseText(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath, path.extname(filePath));

      return [
        {
          title: fileName,
          content: content.trim(),
          category: 'general',
        },
      ];
    } catch (error) {
      throw new Error(`Text parse error: ${error.message}`);
    }
  }

  /**
   * Parse PDF file using pdf-parse
   * Splits by detected headings/sections instead of dumping entire content
   */
  async parsePdf(filePath) {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

      const fileName = path.basename(filePath, '.pdf');
      const rawText = data.text.trim();

      // Split by detected headings/sections
      const sections = this._splitByHeadings(rawText, fileName);

      return sections.length > 0 ? sections : [
        {
          title: fileName,
          content: rawText.substring(0, 5000),
          category: 'general',
        },
      ];
    } catch (error) {
      throw new Error(`PDF parse error: ${error.message}`);
    }
  }

  /**
   * Parse DOCX file using mammoth
   * Attempts to split by headings using HTML output for structure detection
   */
  async parseDocx(filePath) {
    try {
      const mammoth = require('mammoth');
      
      // Try HTML extraction first for heading detection
      let htmlResult;
      try {
        htmlResult = await mammoth.convertToHtml({ path: filePath });
      } catch (e) {
        htmlResult = null;
      }

      const fileName = path.basename(filePath, '.docx');

      // If HTML extraction succeeded, parse headings from HTML
      if (htmlResult && htmlResult.value) {
        const sections = this._splitHtmlByHeadings(htmlResult.value, fileName);
        if (sections.length > 0) return sections;
      }

      // Fallback: extract raw text and split by heading patterns
      const result = await mammoth.extractRawText({ path: filePath });
      const rawText = result.value.trim();
      const sections = this._splitByHeadings(rawText, fileName);

      return sections.length > 0 ? sections : [
        {
          title: fileName,
          content: rawText.substring(0, 5000),
          category: 'general',
        },
      ];
    } catch (error) {
      throw new Error(`DOCX parse error: ${error.message}`);
    }
  }

  /**
   * Split plain text by heading patterns (lines ending with :, all-caps lines, numbered sections)
   * @param {string} text - Raw text content
   * @param {string} parentTitle - Fallback title for the document
   * @returns {Array<{title: string, content: string, category: string}>}
   */
  _splitByHeadings(text, parentTitle) {
    // Heading detection patterns:
    // - Lines that are short and ALL CAPS (likely headings)
    // - Numbered sections: "1.", "1.1.", "Section 1:", "CHƯƠNG", "PHẦN"
    // - Lines ending with ":" that are relatively short
    const headingPatterns = [
      /^(?:CHƯƠNG|PHẦN|MỤC|SECTION|PART|CHAPTER)\s+.+$/gim,
      /^(?:\d+[\.\)]\s*.+)$/gm,
      /^(?:\d+\.\d+[\.\)]\s*.+)$/gm,
      /^[A-ZÀ-Ỹ][A-ZÀ-Ỹ\s]{3,60}$/gm,
      /^.{3,80}:\s*$/gm,
    ];

    // Find all potential heading positions
    const lines = text.split('\n');
    const headingPositions = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      for (const pattern of headingPatterns) {
        // Reset lastIndex for global regex
        pattern.lastIndex = 0;
        const testLine = line;
        if (pattern.test(testLine)) {
          headingPositions.push({ index: i, title: line, level: 1 });
          break;
        }
      }
    }

    // If fewer than 2 headings found, not worth splitting
    if (headingPositions.length < 2) return [];

    const sections = [];
    for (let i = 0; i < headingPositions.length; i++) {
      const current = headingPositions[i];
      const next = headingPositions[i + 1];
      const startLine = current.index + 1;
      const endLine = next ? next.index : lines.length;
      
      const sectionContent = lines.slice(startLine, endLine)
        .join('\n')
        .trim()
        .replace(/\n{3,}/g, '\n\n');

      if (sectionContent.length > 10) {
        sections.push({
          title: `${parentTitle} - ${current.title}`.substring(0, 255),
          content: sectionContent.substring(0, 5000),
          category: 'general',
        });
      }
    }

    return sections;
  }

  /**
   * Split HTML content by heading tags (H1, H2, H3)
   * @param {string} html - HTML content
   * @param {string} parentTitle - Fallback title
   * @returns {Array<{title: string, content: string, category: string, parentIndex?: number}>}
   */
  _splitHtmlByHeadings(html, parentTitle) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    const sections = [];
    let currentH1 = null;
    let currentH1Content = [];

    // Strategy: Collect sections hierarchically
    // H1 = parent, H2/H3 = child entries
    $('body').children().each((_, el) => {
      const tag = $(el).prop('tagName')?.toUpperCase();
      
      if (tag === 'H1') {
        // Save previous H1 section
        if (currentH1 && currentH1Content.length > 0) {
          const content = currentH1Content.join(' ').trim();
          if (content.length > 10) {
            sections.push({
              title: `${parentTitle} - ${currentH1}`,
              content: content.substring(0, 5000),
              category: 'general',
              _h1: currentH1,
            });
          }
        }
        currentH1 = $(el).text().trim();
        currentH1Content = [];
      } else if (tag === 'H2' || tag === 'H3') {
        const heading = $(el).text().trim();
        // Collect following siblings until next heading
        let content = '';
        let next = $(el).next();
        while (next.length > 0) {
          const nextTag = next.prop('tagName')?.toUpperCase();
          if (['H1', 'H2', 'H3'].includes(nextTag)) break;
          if (['P', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'BLOCKQUOTE'].includes(nextTag)) {
            content += ' ' + next.text().trim();
          }
          next = next.next();
        }
        if (heading && content.trim().length > 10) {
          sections.push({
            title: heading.substring(0, 255),
            content: content.trim().substring(0, 5000),
            category: 'general',
          });
        }
        if (currentH1 !== null) {
          currentH1Content.push(heading + ': ' + content.trim());
        }
      } else if (tag === 'P' || tag === 'DIV' || tag === 'LI') {
        if (currentH1 !== null) {
          currentH1Content.push($(el).text().trim());
        }
      }
    });

    // Save last H1 section
    if (currentH1 && currentH1Content.length > 0) {
      const content = currentH1Content.join(' ').trim();
      if (content.length > 10) {
        sections.push({
          title: `${parentTitle} - ${currentH1}`,
          content: content.substring(0, 5000),
          category: 'general',
        });
      }
    }

    return sections;
  }

  /**
   * Scrape content from a website URL
   * Tạo entries phân cấp theo heading (H1 > H2 > H3) với parentId liên kết
   * Nếu có ≥3 headings → chỉ dùng entries theo heading (không tạo full-page duplicate)
   * @param {string} url - Website URL to scrape
   * @returns {Promise<Array>} Extracted content items với _tempId để pipeline link parentId
   */
  async scrapeWebsite(url) {
    try {
      const safeUrl = this.validateScrapeUrl(url);
      console.log(`🌐 Scraping: ${safeUrl.href}`);
      const response = await axios.get(safeUrl.href, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
        },
      });

      const $ = cheerio.load(response.data);
      $('script, style, nav, footer, header, iframe, noscript, .menu, .sidebar, .ads').remove();

      const pageTitle = $('title').text().trim() || safeUrl.hostname;

      // Tìm vùng nội dung chính
      const contentSelectors = ['main', 'article', '.content', '.main-content', '#content', '#main-content', '.post-content', '.entry-content', 'body'];
      let $content = null;
      for (const sel of contentSelectors) {
        if ($(sel).length > 0) { $content = $(sel); break; }
      }
      if (!$content) $content = $('body');

      const results = [];

      // Duyệt cấu trúc heading theo thứ tự trong DOM
      // Dùng stack để track hierarchy: H1 → H2 → H3
      const headings = [];
      $content.find('h1, h2, h3, h4').each((_, el) => {
        const tag = $(el).prop('tagName').toUpperCase();
        const title = $(el).text().trim();
        if (!title) return;

        // Thu thập nội dung sau heading này cho đến heading tiếp theo cùng cấp hoặc cao hơn
        let bodyParts = [];
        let next = $(el).next();
        let limit = 0;
        while (next.length > 0 && limit < 20) {
          const nextTag = next.prop('tagName')?.toUpperCase();
          if (['H1', 'H2', 'H3', 'H4'].includes(nextTag)) break;
          const text = next.text().trim();
          if (text) bodyParts.push(text);
          next = next.next();
          limit++;
        }

        const content = bodyParts.join('\n').trim();
        headings.push({ tag, title, content, url: safeUrl.href });
      });

      if (headings.length >= 3) {
        // Đủ cấu trúc → tạo entries phân cấp, không tạo full-page entry
        let currentH1 = null;
        let currentH2 = null;

        for (const h of headings) {
          const entry = {
            title: h.title,
            content: h.content || `${h.title} — Xem thêm tại ${safeUrl.href}`,
            category: 'general',
            sourceUrl: safeUrl.href,
          };

          if (h.tag === 'H1') {
            currentH1 = entry;
            currentH2 = null;
            // H1 chỉ thêm nếu có nội dung
            if (h.content.length > 20) results.push(entry);
          } else if (h.tag === 'H2') {
            currentH2 = entry;
            if (currentH1) entry._parentTitle = currentH1.title;
            if (h.content.length > 10) results.push(entry);
          } else if (h.tag === 'H3' || h.tag === 'H4') {
            if (currentH2) entry._parentTitle = currentH2.title;
            else if (currentH1) entry._parentTitle = currentH1.title;
            if (h.content.length > 10) results.push(entry);
          }
        }
      } else {
        // Ít heading → tạo 1 entry full-page
        const fullText = $content.text()
          .replace(/\s+/g, ' ')
          .replace(/[ \t]{2,}/g, ' ')
          .trim();

        if (fullText.length > 50) {
          results.push({
            title: pageTitle,
            content: fullText.substring(0, 6000),
            category: 'general',
            sourceUrl: safeUrl.href,
          });
        }
      }

      // Thêm page title entry nếu chưa có H1
      const hasH1 = results.some(r => !r._parentTitle && r.title !== pageTitle);
      if (!hasH1 && results.length > 0 && results[0].title !== pageTitle) {
        results.unshift({
          title: pageTitle,
          content: `Trang web: ${safeUrl.href}`,
          category: 'general',
          sourceUrl: safeUrl.href,
          _isPageRoot: true,
        });
      }

      console.log(`✅ Scraped ${results.length} items from ${safeUrl.href}`);
      return results;
    } catch (error) {
      throw new Error(`Web scraping error: ${error.message}`);
    }
  }

  validateScrapeUrl(inputUrl) {
    let parsed;
    try {
      parsed = new URL(String(inputUrl));
    } catch (error) {
      throw new Error('Invalid scrape URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only http and https URLs are allowed');
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (!hostname) {
      throw new Error('Scrape URL hostname is required');
    }

    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new Error('Localhost scrape URLs are not allowed');
    }

    if (this.isPrivateHostname(hostname)) {
      throw new Error('Private or internal scrape URLs are not allowed');
    }

    return parsed;
  }

  isPrivateHostname(hostname) {
    const ipVersion = net.isIP(hostname);
    if (ipVersion === 4) {
      const octets = hostname.split('.').map((part) => Number(part));
      if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return true;
      }

      const [a, b] = octets;
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      );
    }

    if (ipVersion === 6) {
      const normalized = hostname.toLowerCase();
      return (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb') ||
        normalized.startsWith('::ffff:127.') ||
        normalized.startsWith('::ffff:10.') ||
        normalized.startsWith('::ffff:192.168.')
      );
    }

    return false;
  }

  /**
   * Save uploaded multipart file to disk
   * @param {object} file - Multer file object
   * @returns {Promise<string>} Saved file path
   */
  async saveUploadedFile(file) {
    await this.ensureUploadDir();

    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(this.uploadsDir, `${timestamp}_${safeName}`);

    await fs.writeFile(destPath, file.buffer);
    return destPath;
  }

  /**
   * Clean up uploaded file
   */
  async cleanupFile(filePath) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn('Failed to cleanup file:', filePath);
    }
  }
}

module.exports = new DocParser();
