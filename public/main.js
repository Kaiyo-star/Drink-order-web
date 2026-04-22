const menuGrid = document.getElementById("menuGrid");
const orderForm = document.getElementById("orderForm");
const drinkSelect = document.getElementById("drinkId");
const quantityInput = document.getElementById("quantity");
const totalAmount = document.getElementById("totalAmount");
const cartTotalAmount = document.getElementById("cartTotalAmount");
const cartItems = document.getElementById("cartItems");
const addToCartBtn = document.getElementById("addToCartBtn");
const statusText = document.getElementById("statusText");

let drinks = [];
let cart = [];

function formatCurrency(value) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
  }).format(Number(value) || 0);
}

function renderMenu() {
  menuGrid.innerHTML = drinks
    .map(
      (drink) => `
        <article class="menu-item">
          <strong>${drink.name}</strong>
          <p>${formatCurrency(drink.roomPrice)}</p>

        </article>
      `,
    )
    .join("");

  drinkSelect.innerHTML = drinks
    .map((drink) => `<option value="${drink.id}">${drink.name}</option>`)
    .join("");
}

function getCurrentTotal() {
  const selectedDrink = drinks.find((drink) => drink.id === drinkSelect.value);
  const quantity = Number(quantityInput.value) || 0;
  return selectedDrink ? selectedDrink.roomPrice * quantity : 0;
}

function updateTotal() {
  totalAmount.textContent = formatCurrency(getCurrentTotal());
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.totalAmount, 0);
}

function renderCart() {
  if (!cart.length) {
    cartItems.innerHTML = `<div class="empty-state">Cart masih kosong.</div>`;
  } else {
    cartItems.innerHTML = cart
      .map(
        (item, index) => `
          <article class="order-card">
            <div class="order-top">
              <div>
                <h3 class="order-title">${item.drinkName}</h3>
                <p class="order-meta">
                  Quantity: ${item.quantity}<br />
                  Total: ${formatCurrency(item.totalAmount)}
                </p>
              </div>
              <button class="danger-btn" type="button" data-remove-index="${index}">Remove</button>
            </div>
          </article>
        `,
      )
      .join("");
  }

  cartTotalAmount.textContent = formatCurrency(getCartTotal());
}

async function loadMenu() {
  const response = await fetch("/api/menu");
  const data = await response.json();
  drinks = data.drinks || [];
  renderMenu();
  updateTotal();
  renderCart();
}

orderForm.addEventListener("input", updateTotal);

addToCartBtn.addEventListener("click", () => {
  const selectedDrink = drinks.find((drink) => drink.id === drinkSelect.value);
  const quantity = Number(quantityInput.value);

  if (!selectedDrink || !Number.isInteger(quantity) || quantity < 1) {
    statusText.textContent = "Sila pilih minuman dan quantity yang sah.";
    statusText.className = "status-text error";
    return;
  }

  cart.push({
    drinkId: selectedDrink.id,
    drinkName: selectedDrink.name,
    quantity,
    totalAmount: Number((selectedDrink.roomPrice * quantity).toFixed(2)),
  });

  renderCart();
  quantityInput.value = 1;
  updateTotal();
  statusText.textContent = `${selectedDrink.name} telah ditambah ke cart.`;
  statusText.className = "status-text success";
});

document.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-index]");
  if (!removeButton) return;

  const index = Number(removeButton.dataset.removeIndex);
  cart.splice(index, 1);
  renderCart();
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const customerName = orderForm.customerName.value.trim();
  const roomNumber = orderForm.roomNumber.value.trim();

  if (!customerName || !roomNumber) {
    statusText.textContent = "Sila isi customer name dan room number.";
    statusText.className = "status-text error";
    return;
  }

  if (!cart.length) {
    statusText.textContent =
      "Tambah sekurang-kurangnya satu item ke dalam cart.";
    statusText.className = "status-text error";
    return;
  }

  statusText.textContent = "Submitting cart...";
  statusText.className = "status-text";

  const payload = {
    customerName,
    roomNumber,
    items: cart.map((item) => ({
      drinkId: item.drinkId,
      quantity: item.quantity,
    })),
  };

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to submit cart.");
    }

    orderForm.reset();
    quantityInput.value = 1;
    drinkSelect.selectedIndex = 0;
    cart = [];
    renderCart();
    updateTotal();

    statusText.textContent =
      `Cart dihantar untuk ${payload.customerName}. ` +
      `${data.summary.totalItems} item, jumlah ${formatCurrency(data.summary.totalAmount)}.`;
    statusText.className = "status-text success";
  } catch (error) {
    statusText.textContent = error.message;
    statusText.className = "status-text error";
  }
});

loadMenu().catch(() => {
  statusText.textContent = "Unable to load the menu.";
  statusText.className = "status-text error";
});
