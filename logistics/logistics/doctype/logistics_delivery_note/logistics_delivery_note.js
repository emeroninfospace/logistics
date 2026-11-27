// Copyright (c) 2026, Emeron Infospace and contributors
// For license information, please see license.txt

frappe.ui.form.on("Logistics Delivery Note", {
	setup(frm) {
		frm.set_query("company_address", () => ({
			filters: {
				link_doctype: "Company",
				link_name: frm.doc.company,
			},
		}));
		frm.set_query("outbound", () => ({
			filters: { docstatus: ["<", 2] },
		}));
	},

	refresh(frm) {
		// Opened from Outbound > Create > Delivery Note: pull the Outbound details once
		const has_items = (frm.doc.items || []).some((row) => row.description);
		if (frm.is_new() && frm.doc.outbound && !has_items) {
			frm.trigger("outbound");
		}
	},

	outbound(frm) {
		if (!frm.doc.outbound) return;

		frappe.call({
			method: "logistics.logistics.doctype.logistics_delivery_note.logistics_delivery_note.get_outbound_details",
			args: { outbound: frm.doc.outbound },
			freeze: true,
			callback(r) {
				if (!r.message) return;
				const d = r.message;

				frm.set_value({
					invoice_no: d.invoice_no,
					ship_to: d.ship_to,
					ship_to_name: d.ship_to_name,
					ship_to_address: d.ship_to_address,
				});
				if (d.posting_date) frm.set_value("posting_date", d.posting_date);
				if (d.total_package) frm.set_value("total_package", d.total_package);

				frm.clear_table("items");
				(d.items || []).forEach((item) => {
					frm.add_child("items", item);
				});
				frm.refresh_field("items");
				calculate_totals(frm);
			},
		});
	},

	ship_to(frm) {
		if (!frm.doc.ship_to) {
			frm.set_value("ship_to_address", "");
			return;
		}
		frappe.db.get_value("Address", frm.doc.ship_to, "address_title").then((r) => {
			if (r.message && r.message.address_title) {
				frm.set_value("ship_to_name", r.message.address_title);
			}
		});
		frappe.call({
			method: "frappe.contacts.doctype.address.address.get_address_display",
			args: { address_dict: frm.doc.ship_to },
			callback(r) {
				frm.set_value("ship_to_address", html_to_text(r.message));
			},
		});
	},

	items_remove(frm) {
		calculate_totals(frm);
	},
});

frappe.ui.form.on("Logistics Delivery Note Item", {
	qty(frm) {
		calculate_totals(frm);
	},
	weight(frm) {
		calculate_totals(frm);
	},
});

function calculate_totals(frm) {
	let total_qty = 0;
	let total_weight = 0;
	(frm.doc.items || []).forEach((row) => {
		total_qty += flt(row.qty);
		total_weight += flt(row.weight);
	});
	frm.set_value("total_qty", total_qty);
	frm.set_value("total_weight", flt(total_weight, 2));
}

// Address display comes back as HTML with <br> tags; keep the field as plain text
function html_to_text(value) {
	if (!value) return "";
	return value
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]*>/g, "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.join("\n");
}
