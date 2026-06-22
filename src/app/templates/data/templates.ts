export interface TextTemplateItem {
  type: "text";
  id: string;
  title: string;
  content: string;
}

export interface DisclosureTemplateItem {
  type: "disclosure";
  id: string;
  title: string;
  header: string;
  items: string[];
  defaultChecked: boolean[];
}

export type TemplateItem = TextTemplateItem | DisclosureTemplateItem;

export interface TemplateCategory {
  name: string;
  items: TemplateItem[];
}

export const templateCategories: TemplateCategory[] = [
  {
    name: "【訂單相關】",
    items: [
      {
        type: "text",
        id: "pre-order",
        title: "寫單前置",
        content: [
          "👇👇麻煩點擊下方連結🔗 ",
          "提供訂購資訊以利系統建檔 👇👇",
          "",
          "https://forms.gle/4zGJ9xVQdkwQYtz8A",
          "",
          "後續會再寫訂單給您們確認哦！",
          "",
          "",
          "@附贈的抱枕 （請挑一色），亦可加價更改其他材質",
          "[涼感布] https://reurl.cc/37ELA9",
          "[貓抓布] https://reurl.cc/L4rdoe",
          "",
          "🔺若無挑選顏色即為「同意馬鈴薯沙發隨機配色」",
          "🔺屆時叫料完成後若需更改抱枕顏色將酌收工資",
        ].join("\n"),
      },
      {
        type: "disclosure",
        id: "disclosure",
        title: "告知事項",
        header: "【請確認各項訂製內容及告知事項確認無誤後，支付訂金以示同意】",
        items: [
          "▲ 週一至週六 10:00 - 19:00 專人運送到府，若需安排特定時段，需負擔部分運費。（★恕週六無法指定時段）",
          "▢ 本訂貨單(款式、面向、尺寸、座位數、面料、顏色、椅腳)皆依照客戶需求訂定之客製化合約，故無提供鑑賞期，亦無提供退換貨服務。",
          "▢ 客戶務必詳細確認各項訂製內容，任何口頭協議若與本訂貨單相違背，皆以本訂貨單為依據。",
          "▢ 客戶經確認查收廠務人員叫料通知訊息後，將無法取消該筆訂貨單，恕不予退還訂金款項與換貨。",
          "▢ 沙發皆為手工訂製品，產品尺寸丈量誤差值 ±3–5公分以內皆為正常值，恕不因此提供退換貨。",
          "▢ 客製修改椅腳將導致坐高差異，日後若需修改將酌收衍生工資及材料費。",
          "▢ 面料、泡棉、黏著劑及羽毛，剛製作完成味道較明顯屬正常現象，恕不因此提供退換貨。",
          "▢ 牛皮取之於自然；如頸紋、成長痕、刺痕、蟲斑皆為自然現象，不影響使用，恕不因此提供退換貨。",
          "▢ 各種面料於不同生產批次，其染料會有些許顏色差異，且牛皮與PVC合成皮必定存在色差，恕不因此提供退換貨。",
          "▢ 寵物貓抓布料(皮革)對寵物抓磨、尖銳物品有基本的承受力，但並非不會破損（車縫線及轉角處），請注意避免不當使用。",
          "▢ 坐墊軟硬度皆屬個人主觀感受，且全新品與展示品必存在些許差異，本廠僅依客戶需求更改材料及工法，恕不因此提供退換貨。",
          "▢ 若因樓梯、電梯、門框、搬運動線等尺寸問題，導致沙發無法搬運，客戶需自行負擔吊車、來回修改運費及工資等相關衍生費用。（樓梯轉角處、樓梯加裝鐵門、進門處有玄關或櫃體。【現場酌收工資】扶手組裝 $500；椅背組裝 $1,000）",
        ],
        defaultChecked: [true, true, true, true, true, false, true, false, true, false, true, true],
      },
      {
        type: "text",
        id: "payment-confirm",
        title: "款項確認",
        content: "好哦👌 非常感謝～ 會在請老闆查收款項哦！",
      },
    ],
  },
  {
    name: "【通用訊息】",
    items: [
      {
        type: "text",
        id: "greeting",
        title: "基本問候",
        content: "您好，這裡是馬鈴薯沙發，請問有什麼可以為您服務的嗎？",
      },
      {
        type: "text",
        id: "closing",
        title: "結束語",
        content: "感謝您的耐心配合，如有任何問題歡迎隨時與我們聯繫！😊",
      },
    ],
  },
  {
    name: "【產品報價】",
    items: [
      {
        type: "text",
        id: "price-inquiry",
        title: "報價詢問回覆",
        content: "好的，我先為您確認相關報價，稍後提供给您參考。",
      },
    ],
  },
  {
    name: "【清潔方式】",
    items: [
      {
        type: "text",
        id: "fabric-care",
        title: "布料清潔",
        content: "布料沙發布套建議以吸塵器定期清理灰塵，局部污漬可用稀釋中性清潔劑輕柔擦拭，避免過度搓揉。",
      },
      {
        type: "text",
        id: "leather-care",
        title: "皮革保養",
        content: "皮革沙發建議每 3-6 個月使用專用皮革保養油擦拭，避免陽光直射及高溫環境。",
      },
    ],
  },
  {
    name: "【排程】",
    items: [
      {
        type: "text",
        id: "schedule-delay",
        title: "排程延遲通知",
        content: "不好意思，因近期訂單較滿，您的訂單預計會延遲約 ○ 個工作天，我們會盡快為您安排，造成不便敬請見諒。",
      },
    ],
  },
];
