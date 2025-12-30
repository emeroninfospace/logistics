// // Copyright (c) 2025, Emeron Infospace and contributors
// // For license information, please see license.txt

frappe.ui.form.on("Job Order", {

    refresh(frm) {
        if (frm.doc.docstatus == 1) {
            frm.add_custom_button(__('Outbound'), function() {
                frappe.call({
                    method:  "logistics.logistics.doctype.job_order.job_order.make_outbound",
                    args: {
                        order_name: frm.doc.name
                    },
                    callback: function(r) {
                        if (r.message) {
                            frappe.show_alert({
                                message: "Outbound is Created",
                                indicator: 'green'
                            }, 5);
                            frappe.set_route('Form', 'Outbound', r.message);
                        }
                    }
                });
            }, __('Create'));
        }

	},
	onload: function(frm) {
        if (!frm.doc.company && frappe.defaults.get_user_default("Company")) {
            frm.set_value(
                'company',
                frappe.defaults.get_user_default("Company")
            );
        }
    },
    supplier: function(frm) {
		if (frm.doc.supplier) {
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Supplier",
					name: frm.doc.supplier
				},
				callback: function(r) {
					
					if (r.message) {
						let supplier = r.message;
						if (supplier.supplier_primary_address) {
							frm.set_value("supplier_address", supplier.supplier_primary_address);
						}
					}
				}
			});
		} else {
			frm.set_value("supplier_address", "");
			frm.set_value("supplier_address_display", "");
		}
	},
    customer: function(frm) {
		if (frm.doc.customer) {
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Customer",
					name: frm.doc.customer
				},
				callback: function(r) {
					if (r.message) {
						let customer = r.message;
						if (customer.customer_primary_address) {
							frm.set_value("customer_address", customer.customer_primary_address);
						}
					}
				}
			});
		} else {
			frm.set_value("customer_address", "");
			frm.set_value("address_display", "");
		}
	},
    customer_address: function (frm) {
		if (frm.doc.customer) {
			frappe.call({
				method: "frappe.contacts.doctype.address.address.get_address_display",
				args: {
					address_dict: frm.doc.customer_address,
				},
				callback: function (r) {
					frm.set_value("address_display", r.message);
				},
			});
        }
		if (!frm.doc.customer_address) {
			frm.set_value("address_display", "");
		}
	},
    supplier_address: function (frm) {
		if (frm.doc.supplier) {
			frappe.call({
				method: "frappe.contacts.doctype.address.address.get_address_display",
				args: {
					address_dict: frm.doc.supplier_address,
				},
				callback: function (r) {
					frm.set_value("supplier_address_display", r.message);
				},
			});
        }
		if (!frm.doc.supplier_address) {
			frm.set_value("supplier_address_display", "");
		}
	},
    items_add: function(frm, cdt, cdn) {
		calculate_totals(frm);
	},
	items_remove: function(frm, cdt, cdn) {
		calculate_totals(frm);
	},
});
frappe.ui.form.on("Job Order Item", {
	qty: function(frm, cdt, cdn) {
		calculate_item_total(frm, cdt, cdn);
	},
	unit_price: function(frm, cdt, cdn) {
		calculate_item_total(frm, cdt, cdn);
	},
    unit_wt: function(frm, cdt, cdn) {
        calculate_item_total(frm, cdt, cdn);
    },
});

function calculate_item_total(frm, cdt, cdn) {
	let row = locals[cdt][cdn];
	if (row.qty && row.unit_price) {
		row.total_value = row.qty * row.unit_price;
	}
    if (row.qty && row.unit_wt) {
		row.gross_wt = row.qty * row.unit_wt;
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
            total_gross += item.gross_wt || 0;
			total_value += item.total_value || 0;
		});
	}
	
	frm.set_value("total_qty", total_qty);
    frm.set_value("total_gross_wt", total_gross);
	frm.set_value("total_value", total_value);
}



