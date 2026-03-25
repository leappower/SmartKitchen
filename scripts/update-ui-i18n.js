const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/assets/ui-i18n.json', 'utf8'));

// 定义各语言的新 key 值
const translations = {
  'zh-CN': {
    btn_close: '关闭',
    user_agreement_section_2_title: '二、商用厨房设备服务',
    user_agreement_section_2_content: '我们的服务专为 B2B 商用厨房设备咨询、报价和采购而设计。我们专注于发酵柜、商用烤箱和工业厨房解决方案。',
    user_agreement_section_3_title: '三、产品信息与定价',
    user_agreement_section_3_content: '所有产品规格、价格和供货情况如有变更，恕不另行通知。最终价格在正式报价时确认。',
    user_agreement_section_4_title: '四、国际贸易条款',
    user_agreement_section_4_content: '所有订单均受《2020 年国际贸易术语解释通则》约束。除非另有书面约定，运费、关税和进口税由买方承担。',
    user_agreement_section_5_title: '五、保修与认证',
    user_agreement_section_5_content: '我们的产品具有 CE 认证，符合国际食品安全标准。保修条款在正式销售合同中规定。',
    user_agreement_section_6_title: '六、知识产权',
    user_agreement_section_6_content: '本网站上的所有产品设计、商标和内容均为佛山市跃迁力科技有限公司的财产。',
    user_agreement_section_7_title: '七、责任限制',
    user_agreement_section_7_content: '对于因使用我们的产品或服务而产生的任何间接、附带或后果性损害，我们不承担任何责任。',
    user_agreement_section_8_title: '八、适用法律',
    user_agreement_section_8_content: '这些条款受中华人民共和国法律管辖。任何争议应通过友好协商解决，或提交广东佛山有管辖权的法院。',
    user_agreement_section_9_title: '九、联系信息',
    user_agreement_section_9_content: '如有关于这些条款的任何问题，请通过 WhatsApp、电子邮件或我们网站上的联系表单与我们联系。',
    privacy_section_2_title: '二、数据收集目的',
    privacy_section_2_content: '我们使用您的信息来：(a) 处理您的咨询并提供报价；(b) 就订单和交付进行沟通；(c) 提供售后支持；(d) 在您同意的情况下发送产品更新和促销信息。',
    privacy_section_3_title: '三、处理的法律依据',
    privacy_section_3_content: '我们基于以下原因处理您的数据：(a) 履行合同的必要性；(b) 业务运营的合法利益；(c) 您对市场推广的同意；(d) 法律合规要求。',
    privacy_section_4_title: '四、数据共享与第三方',
    privacy_section_4_content: '我们不会出售您的个人数据。我们可能会与以下方共享信息：(a) 运输和物流合作伙伴；(b) 支付处理商；(c) 法律要求的当局。',
    privacy_section_5_title: '五、国际数据传输',
    privacy_section_5_content: '作为国际企业，您的数据可能会传输到我们的服务提供商所在的中国和其他国家进行处理。我们确保采取适当的保护措施。',
    privacy_section_6_title: '六、数据安全',
    privacy_section_6_content: '我们实施行业标准的安全措施，包括加密、访问控制和定期安全审计，以保护您的数据免受未经授权的访问或披露。',
    privacy_section_7_title: '七、您的权利',
    privacy_section_7_content: '您有权：(a) 访问您的个人数据；(b) 要求更正或删除；(c) 反对处理；(d) 撤回同意；(e) 要求数据可移植性。联系我们以行使这些权利。',
    privacy_section_8_title: '八、Cookie 与跟踪',
    privacy_section_8_content: '我们使用 Cookie 和类似技术来增强您的浏览体验、分析网站流量和个性化内容。您可以通过浏览器设置管理 Cookie 偏好。',
    privacy_section_9_title: '九、数据保留',
    privacy_section_9_content: '我们会在实现本政策所述目的所需的时间内保留您的个人数据，遵守法律义务、解决争议并执行协议。',
    privacy_section_10_title: '十、条款变更',
    privacy_section_10_content: '我们可能会定期更新本隐私政策。更改将发布在此页面上，并更新生效日期。继续使用我们的服务即表示接受更新后的政策。',
    privacy_section_11_title: '十一、联系我们',
    privacy_section_11_content: '如有隐私相关问题，请通过 WhatsApp、电子邮件 support.kitchen@yukoli.com 或我们网站上的联系表单与我们联系。'
  },
  'zh-TW': {
    btn_close: '關閉',
    user_agreement_section_2_title: '二、商用廚房設備服務',
    user_agreement_section_2_content: '我們的服務專為 B2B 商用廚房設備諮詢、報價和採購而設計。我們專注於發酵櫃、商用烤箱和工業廚房解決方案。',
    user_agreement_section_3_title: '三、產品資訊與定價',
    user_agreement_section_3_content: '所有產品規格、價格和供貨情況如有變更，恕不另行通知。最終價格在正式報價時確認。',
    user_agreement_section_4_title: '四、國際貿易條款',
    user_agreement_section_4_content: '所有訂單均受《2020 年國際貿易術語解釋通則》約束。除非另有書面約定，運費、關稅和進口稅由買方承擔。',
    user_agreement_section_5_title: '五、保固與認證',
    user_agreement_section_5_content: '我們的產品具有 CE 認證，符合國際食品安全標準。保固條款在正式銷售合同中規定。',
    user_agreement_section_6_title: '六、知識產權',
    user_agreement_section_6_content: '本網站上的所有產品設計、商標和內容均為佛山市躍遷力科技有限公司的財產。',
    user_agreement_section_7_title: '七、責任限制',
    user_agreement_section_7_content: '對於因使用我們的產品或服務而產生的任何間接、附帶或後果性損害，我們不承擔任何責任。',
    user_agreement_section_8_title: '八、適用法律',
    user_agreement_section_8_content: '這些條款受中華人民共和國法律管轄。任何爭議應通過友好協商解決，或提交廣東佛山有管轄權的法院。',
    user_agreement_section_9_title: '九、聯繫資訊',
    user_agreement_section_9_content: '如有關於這些條款的任何問題，請通過 WhatsApp、電子郵件或我們網站上的聯繫表單與我們聯繫。',
    privacy_section_2_title: '二、數據收集目的',
    privacy_section_2_content: '我們使用您的資訊來：(a) 處理您的諮詢並提供報價；(b) 就訂單和交付進行溝通；(c) 提供售後支援；(d) 在您同意的情況下發送產品更新和促銷資訊。',
    privacy_section_3_title: '三、處理的法律依據',
    privacy_section_3_content: '我們基於以下原因處理您的數據：(a) 履行合同的必要性；(b) 業務運營的合法利益；(c) 您對市場推廣的同意；(d) 法律合規要求。',
    privacy_section_4_title: '四、數據共享與第三方',
    privacy_section_4_content: '我們不會出售您的個人數據。我們可能會與以下方共享資訊：(a) 運輸和物流合作夥伴；(b) 支付處理商；(c) 法律要求的當局。',
    privacy_section_5_title: '五、國際數據傳輸',
    privacy_section_5_content: '作為國際企業，您的數據可能會傳輸到我們的服務提供商所在的中國和其他國家進行處理。我們確保採取適當的保護措施。',
    privacy_section_6_title: '六、數據安全',
    privacy_section_6_content: '我們實施行業標準的安全措施，包括加密、訪問控制和定期安全審計，以保護您的數據免受未經授權的訪問或披露。',
    privacy_section_7_title: '七、您的權利',
    privacy_section_7_content: '您有權：(a) 訪問您的個人數據；(b) 要求更正或刪除；(c) 反對處理；(d) 撤回同意；(e) 要求數據可移植性。聯繫我們以行使這些權利。',
    privacy_section_8_title: '八、Cookie 與跟踪',
    privacy_section_8_content: '我們使用 Cookie 和類似技術來增強您的瀏覽體驗、分析網站流量和個性化內容。您可以通過瀏覽器設置管理 Cookie 偏好。',
    privacy_section_9_title: '九、數據保留',
    privacy_section_9_content: '我們會在實現本政策所述目的所需的時間內保留您的個人數據，遵守法律義務、解決爭議並執行協議。',
    privacy_section_10_title: '十、條款變更',
    privacy_section_10_content: '我們可能會定期更新本隱私政策。更改將發布在此頁面上，並更新生效日期。繼續使用我們的服務即表示接受更新後的政策。',
    privacy_section_11_title: '十一、聯繫我們',
    privacy_section_11_content: '如有隱私相關問題，請通過 WhatsApp、電子郵件 support.kitchen@yukoli.com 或我們網站上的聯繫表單與我們聯繫。'
  },
  'en': {
    btn_close: 'Close',
    user_agreement_section_2_title: '2. Commercial Kitchen Equipment Services',
    user_agreement_section_2_content: 'Our services are specifically designed for B2B commercial kitchen equipment inquiries, quotations, and purchases. We specialize in fermentation cabinets, commercial ovens, and industrial kitchen solutions.',
    user_agreement_section_3_title: '3. Product Information & Pricing',
    user_agreement_section_3_content: 'All product specifications, prices, and availability are subject to change without notice. Final pricing is confirmed upon official quotation.',
    user_agreement_section_4_title: '4. International Trade Terms',
    user_agreement_section_4_content: 'All orders are subject to Incoterms 2020. Shipping costs, customs duties, and import taxes are the responsibility of the buyer unless otherwise agreed in writing.',
    user_agreement_section_5_title: '5. Warranty & Certification',
    user_agreement_section_5_content: 'Our products come with CE certification and comply with international food safety standards. Warranty terms are specified in the official sales contract.',
    user_agreement_section_6_title: '6. Intellectual Property',
    user_agreement_section_6_content: 'All product designs, trademarks, and content on this website are the property of Foshan YuKoLi Technology Co., Ltd.',
    user_agreement_section_7_title: '7. Limitation of Liability',
    user_agreement_section_7_content: 'We shall not be liable for any indirect, incidental, or consequential damages arising from the use of our products or services.',
    user_agreement_section_8_title: '8. Governing Law',
    user_agreement_section_8_content: 'These terms are governed by the laws of the People\'s Republic of China. Any disputes shall be resolved through friendly negotiation or submitted to the competent courts in Foshan, Guangdong.',
    user_agreement_section_9_title: '9. Contact Information',
    user_agreement_section_9_content: 'For any questions regarding these terms, please contact us via WhatsApp, email, or the contact form on our website.',
    privacy_section_2_title: '2. Purpose of Data Collection',
    privacy_section_2_content: 'We use your information to: (a) Process your inquiries and provide quotations; (b) Communicate about orders and deliveries; (c) Provide after-sales support; (d) Send product updates and promotional information (with your consent).',
    privacy_section_3_title: '3. Legal Basis for Processing',
    privacy_section_3_content: 'We process your data based on: (a) Contractual necessity for order fulfillment; (b) Legitimate interests in business operations; (c) Your consent for marketing communications; (d) Legal compliance requirements.',
    privacy_section_4_title: '4. Data Sharing & Third Parties',
    privacy_section_4_content: 'We do not sell your personal data. We may share information with: (a) Shipping and logistics partners for delivery; (b) Payment processors for transaction handling; (c) Legal authorities when required by law.',
    privacy_section_5_title: '5. International Data Transfers',
    privacy_section_5_content: 'As an international business, your data may be transferred to and processed in China and other countries where our service providers operate. We ensure appropriate safeguards are in place.',
    privacy_section_6_title: '6. Data Security',
    privacy_section_6_content: 'We implement industry-standard security measures including encryption, access controls, and regular security audits to protect your data from unauthorized access or disclosure.',
    privacy_section_7_title: '7. Your Rights',
    privacy_section_7_content: 'You have the right to: (a) Access your personal data; (b) Request correction or deletion; (c) Object to processing; (d) Withdraw consent; (e) Request data portability. Contact us to exercise these rights.',
    privacy_section_8_title: '8. Cookies & Tracking',
    privacy_section_8_content: 'We use cookies and similar technologies to enhance your browsing experience, analyze site traffic, and personalize content. You can manage cookie preferences through your browser settings.',
    privacy_section_9_title: '9. Data Retention',
    privacy_section_9_content: 'We retain your personal data for as long as necessary to fulfill the purposes outlined in this policy, comply with legal obligations, resolve disputes, and enforce agreements.',
    privacy_section_10_title: '10. Changes to This Policy',
    privacy_section_10_content: 'We may update this Privacy Policy periodically. Changes will be posted on this page with an updated effective date. Continued use of our services constitutes acceptance of the updated policy.',
    privacy_section_11_title: '11. Contact Us',
    privacy_section_11_content: 'For privacy-related inquiries, please contact us via WhatsApp, email at support.kitchen@yukoli.com, or through our website contact form.'
  }
};

// 其他语言使用英文
const otherLangs = ['ar', 'de', 'es', 'fil', 'fr', 'he', 'hi', 'id', 'it', 'ja', 'km', 'ko', 'lo', 'ms', 'my', 'nl', 'pl', 'pt', 'ru', 'th', 'tr', 'vi', 'zh'];
otherLangs.forEach(lang => {
  translations[lang] = translations['en'];
});

// 为每种语言添加新 key
Object.keys(data).forEach(lang => {
  if (translations[lang]) {
    Object.assign(data[lang], translations[lang]);
    console.log('Updated: ' + lang);
  }
});

fs.writeFileSync('src/assets/ui-i18n.json', JSON.stringify(data, null, 2) + '\n');
console.log('ui-i18n.json updated successfully!');
