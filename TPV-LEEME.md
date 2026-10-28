# TPV Platet + 扫码点餐 (Pedidos QR)

| 页面 | 用途 |
|---|---|
| `pos.html` | 收银台 TPV：员工 PIN 登录、桌位图、点单、🎤 语音点单、厨房单、折扣、收银（现金/刷卡/Bizum）、X/Z 日结、菜单和员工管理 |
| `pedir.html?mesa=T5` | 顾客扫码后的点餐页（手机），可下单、呼叫服务员、要账单 |
| `qr.html` | 生成并打印每张桌子的二维码 |
| `index.html` | 原来的网页菜单（未改动） |

默认员工 PIN：CHARLY `1111`（管理员）、ANA `2222`、KELLY `3333`、EMPLEADO `0000`。
**请第一时间在 Ajustes → Usuarios 里修改。**

饮料、咖啡、蒙塔迪多、小吃、甜品的价格是示例价格（网页菜单里没有），请在 Ajustes → Productos 里改成实际价格。

## 两种模式

1. **本地模式（默认，`config.js` 里 `firebaseUrl` 为空）**
   所有数据只保存在这台收银电脑的浏览器里。可以直接当收银机用，但**顾客手机下的单不会到达收银台**。
2. **云端模式（扫码点餐必须）**
   收银台和顾客手机通过免费的 Firebase Realtime Database 实时同步。

## 开启扫码点餐（Firebase，免费额度够用）

1. 打开 <https://console.firebase.google.com> → 新建项目（例如 `platet-tpv`）。
2. 左侧 *Build → Realtime Database → Create database*，位置选 `europe-west1`，选 *locked mode*。
3. 在 *Rules（规则）* 标签页粘贴下面的规则并发布：

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "platet": {
      "menu": { ".read": true },
      "mods": { ".read": true },
      "orders": {
        "$id": {
          ".read": true,
          ".write": "!data.exists() && newData.child('status').val() === 'new'",
          ".validate": "newData.hasChildren(['id', 'table', 'type', 'status', 'createdAt'])"
        }
      }
    }
  }
}
```

   这样顾客只能读菜单和修改项、提交新订单；看不到销售额、员工和 PIN。

4. 复制数据库地址（类似 `https://platet-tpv-default-rtdb.europe-west1.firebasedatabase.app`），填进 `config.js` 的 `firebaseUrl`，提交到 GitHub。
5. *Project settings（齿轮）→ Service accounts → Database secrets* 复制密钥。
   在收银电脑上打开 `pos.html`，第一次会要求输入这个密钥 —— **它只保存在收银电脑上，不要放进代码库**。
6. 打开 `qr.html` → 打印 → 把二维码贴在每张桌子上。

## 复杂客人：不要什么 / 加什么 / 菜单外

- **修改一道菜**：点一下账单里的那一行，再点一次（或按 ✏️ Modificar）→ 选「不要」（SIN 洋葱…）、「加料」（EXTRA 培根 +1 €…，自动加价）、「做法」（五分熟、酱汁分开…），还可以写自由备注。
  如果 3 个汉堡只有 1 个不要洋葱，选「应用到 1 份」，这一行会自动拆开。
- **菜单外商品**：✎ Artículo libre → 写名字和价格（也可以先在数字键盘输入价格）。
- 修改项清单在 Ajustes → Modificadores 里可以增删改（含价格和三种语言）。
- 厨房单上会打印：`» SIN Cebolla · EXTRA Bacon · Al punto`。
- 顾客扫码点餐时，点菜名也能自己选「不要 / 加料 / 做法」，价格由收银台计算。

## 🎤 语音点单

点单界面按 **🎤 Por voz**（手机上在右上角），说出整单，例如：

- 「dos cañas, tres croquetas y una hamburguesa supersónica sin cebolla con bacon」
- 「三个基础汉堡，一个不要洋葱加培根，两杯小杯生啤」
- 「two small beers and a burger without onion」

系统会列出识别结果，确认后一键加入账单。

**怎么做到不依赖网络、少调用 API：**

1. **菜单预先加载在本地。** 每道菜的西语、英语、中文名称和修改项（不要／加料／做法）都在本机建好索引。还能识别以下说法，全部在本地完成：
   - 数量词：dos、two、两杯、三个
   - 复数：cañas、calamares
   - 拆份：「tres hamburguesas, una sin cebolla」会自动拆成 2+1
   - 一个字母的识别错误
2. **自动学习。** 遇到没听懂（❓）的说法，服务员点一下正确的商品，系统就记住「这句话 = 这个商品」，下次立刻识别。整句点单也会被记住，同一句话再说一次直接出结果。
   - 设置 → Voz e IA 里可以看到学了多少，也能导出、导入、清除记忆。
   - 云端模式下，所有服务员手机共享同一份记忆。
3. **AI 只用来补漏，而且是可选的。** 只有本地听不懂的那一小段才会发给 AI，AI 的答案同样会被记住，下次不再问。
   - 在设置 → Voz e IA 里填 Anthropic API 密钥即可开启。密钥只保存在这台设备上，请使用设置了消费上限的专用密钥。
   - 不填密钥也能完全正常使用，只是没听懂的要手动选。

**关于语音识别（把声音变成文字）这一步：** 这一步由手机或浏览器自己完成。系统会优先使用设备上的离线识别，但能否离线取决于设备：
- 安卓 Chrome：需要下载对应语言的离线语音包。
- iPhone：新机型多数支持离线识别。

如果识别不了，也可以用手机键盘上的 🎤 听写，或者直接打字，后面的解析照样在本地完成。

## 三种语言

收银台和顾客点餐页都支持 **ES / EN / 中文**，右上角切换，每台设备分别记住。
菜品的英文、中文名可以在 Ajustes → Productos 里修改。小票和厨房单始终打印西班牙语。

## 手机点单（服务员）

用手机打开 `pos.html`：桌位变成按钮列表，菜品大按钮，加菜时会震动提示，点右上角 🧾 看账单、送厨房、收款。

## VeriFactu

现在已经做好的准备：
- 简易发票（factura simplificada）按前缀**连续编号**（T2026-000001…），记录日期时间、税基、IVA、合计。
- Caja → 导出 CSV 给会计。

真正上线 VeriFactu 还需要：每张发票生成带哈希链的登记记录、小票上打印 AEAT 的二维码、用电子证书把记录发送给税务局，并且软件要有厂商的「declaración responsable」。
这部分**不能只靠网页完成**（证书不能放在公开网页里）。最稳妥的做法是以后接一个 VeriFactu API 服务商，由收银台在收款时调用。数据结构已经为此预留好了。

## 日常使用

- 顾客下单后，收银台会响铃，桌子变红闪烁，点 **📲 Pedidos QR** 接受或拒绝；接受后自动加到该桌账单，顾客手机上显示「已确认」。
- 价格永远以收银台菜单为准（顾客无法篡改价格）。
- 下班点 **Caja → Cerrar caja (Z)** 日结。
- 打印使用浏览器打印（选 80mm 小票打印机）。

## 限制说明

- 目前还不是经过认证的 VeriFactu 财税软件（见上面 VeriFactu 一节）。
- 现金抽屉、厨房打印机自动出单需要额外的本地打印服务，目前用浏览器打印代替。
