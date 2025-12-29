// Copyright (c) 2025, Emeron Infospace and contributors
// For license information, please see license.txt

frappe.ui.form.on("Commercial Invoice", {
	// refresh(frm) {

	// },
    terms: function(frm) {
        erpnext.utils.get_terms(frm.doc.terms, frm.doc, function(r) {
		if(!r.exc) {
			frm.set_value("terms_and_condition", r.message);
		}
	});
    }
});
frappe.ui.form.on("Invoice Item", {
	qty: function(frm, cdt, cdn) {
		calculate_item_total(frm, cdt, cdn);
	},
	unit_price: function(frm, cdt, cdn) {
		calculate_item_total(frm, cdt, cdn);
	},
    weight: function(frm, cdt, cdn) {
		calculate_item_total(frm, cdt, cdn);
	},
});

function calculate_item_total(frm, cdt, cdn) {
	let row = locals[cdt][cdn];
	if (row.qty && row.unit_price) {
		row.extended_price = row.qty * row.unit_price;
	}
 
	frm.refresh_field("items");
	calculate_totals(frm);
}

function calculate_totals(frm) {
	let total_qty = 0;
	let total_value = 0;
    let total_gross = 0;
	
	if (frm.doc.items && frm.doc.items.length > 0) {
		frm.doc.items.forEach(function(item) {
			total_qty += item.qty || 0;

            total_gross += item.weight || 0;
			total_value += item.extended_price || 0;
		});
	}
	
	frm.set_value("total_units", total_qty);
    frm.set_value("total_weight", total_gross);
    frm.set_value("subtotal", total_value);
	frm.set_value("grand_total", total_value);
}
