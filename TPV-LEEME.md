# TPV Platet + 扫码点餐 (Pedidos QR)

| 页面 | 用途 |
|---|---|
| `pos.html` | 收银台 TPV：员工 PIN 登录、桌位图、点单、厨房单、折扣、收银（现金/刷卡/Bizum）、X/Z 日结、菜单和员工管理 |
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

   这样顾客只能读菜单、提交新订单；看不到销售额、员工和 PIN。

4. 复制数据库地址（类似 `https://platet-tpv-default-rtdb.europe-west1.firebasedatabase.app`），填进 `config.js` 的 `firebaseUrl`，提交到 GitHub。
5. *Project settings（齿轮）→ Service accounts → Database secrets* 复制密钥。
   在收银电脑上打开 `pos.html`，第一次会要求输入这个密钥 —— **它只保存在收银电脑上，不要放进代码库**。
6. 打开 `qr.html` → 打印 → 把二维码贴在每张桌子上。

## 日常使用

- 顾客下单后，收银台会响铃，桌子变红闪烁，点 **📲 Pedidos QR** 接受或拒绝；接受后自动加到该桌账单，顾客手机上显示「已确认」。
- 价格永远以收银台菜单为准（顾客无法篡改价格）。
- 下班点 **Caja → Cerrar caja (Z)** 日结。
- 打印使用浏览器打印（选 80mm 小票打印机）。

## 限制说明

- 这是网页版收银系统，不是经过认证的财税软件；西班牙 VeriFactu / TicketBAI 申报需要另外对接认证软件。
- 现金抽屉、厨房打印机自动出单需要额外的本地打印服务，目前用浏览器打印代替。
