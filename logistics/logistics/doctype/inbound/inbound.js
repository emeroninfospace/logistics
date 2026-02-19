// // Copyright (c) 2025, Emeron Infospace and contributors
// // For license information, please see license.txt

frappe.ui.form.on("Inbound", {
    refresh(frm) {
		const grid = frm.fields_dict["items"].grid;

		grid.wrapper.find(".custom-upload-btn, .custom-download-btn").remove();

		const $uploadBtn = $(`<button type="button" class="btn btn-xs btn-secondary custom-upload-btn">${__("Upload")}</button>`);
		const $downloadBtn = $(`<button type="button" class="btn btn-xs btn-secondary custom-download-btn">${__("Download")}</button>`);

		$uploadBtn.on("click", () => upload_file(frm));
		$downloadBtn.on("click", () => download_file(frm));

		grid.wrapper.find(".grid-bulk-actions")
			.append($downloadBtn)
			.append($uploadBtn);

		if (frm.doc.docstatus == 1) {
			frm.add_custom_button(__('Outbound'), function() {
				frappe.call({
					method: "logistics.logistics.doctype.inbound.inbound.make_outbound",
					args: { order_name: frm.doc.name },
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
	default_uom: function(frm) {
		frm.doc.items.forEach(function(item) {
			item.uom = frm.doc.default_uom;
		});
		frm.refresh_field("items");
	},
		
     currency: function (frm) {
 		// this.set_dynamic_labels();
 		let company_currency = "AED";
 		// Added `ignore_pricing_rule` to determine if document is loading after mapping from another doc
 		if (frm.doc.currency && frm.doc.currency !== company_currency) {
 			frappe.call({
 				method: "erpnext.setup.utils.get_exchange_rate",
 				args: {
 					transaction_date: frm.doc.posting_date,
 					from_currency: frm.doc.currency,
 					to_currency: company_currency,
 					args: "for_selling",
 				},
 				freeze: true,
 				freeze_message: __("Fetching exchange rates ..."),
 				callback: function (r) {
 					const exchange_rate = flt(r.message);
 					if (exchange_rate != frm.doc.conversion_rate) {
 						frm.set_value("conversion_rate", exchange_rate);
 					}
 				},
 			});
 		} else {
 			frm.trigger("conversion_rate");
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
frappe.ui.form.on("Inbound Item", {
	qty: function(frm, cdt, cdn) {
		calculate_item_total(frm, cdt, cdn);
	},
	total_value: function(frm, cdt, cdn) {
		calculate_item_total(frm, cdt, cdn);
	},
    gross_wt: function(frm, cdt, cdn) {
        calculate_item_total(frm, cdt, cdn);
    },
});
function form_render(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    frappe.model.set_value(cdt, cdn, "coo", "");
}
function calculate_item_total(frm, cdt, cdn) {
	let row = locals[cdt][cdn];
	if (row.qty && row.total_value) {
		row.unit_price = row.total_value / row.qty;
	}
    if (row.qty && row.gross_wt) {
		row.unit_wt = row.gross_wt / row.qty
	}
	frm.refresh_field("items");
	calculate_totals(frm);
}

function calculate_totals(frm) {
    let total_qty = 0;
    let total_value = 0;
    let total_gross = 0;
	let base_total_value = 0;
    
    if (frm.doc.items && frm.doc.items.length > 0) {
        frm.doc.items.forEach(function(item) {
            if (item.qty && item.total_value) {
                item.unit_price = item.total_value / item.qty;
            }
            if (item.qty && item.gross_wt) {
                item.unit_wt = item.gross_wt / item.qty;
            }
            
            total_qty += item.qty || 0;
            total_gross += item.gross_wt || 0;
            total_value += item.total_value || 0;
        });
 		if (frm.doc.currency !== "AED") {
 			base_total_value = total_value * frm.doc.conversion_rate;
 		} else {
			base_total_value = total_value;
		}
        
        frm.refresh_field("items");
    }
    
    frm.set_value("total_qty", total_qty);
    frm.set_value("total_gross_wt", total_gross);
    frm.set_value("total_value", total_value);
	frm.set_value("base_total", base_total_value);
}


function download_file(frm) {
	const payload = frm.is_new() ? {} : {items: frm.doc.items};

    open_url_post("/api/method/logistics.logistics.doctype.inbound.inbound.downlode_file", payload);
}

function upload_file(frm) {
	new frappe.ui.FileUploader({
		restrictions: {
			allowed_file_types: [".xlsx"],
		},
		on_success: function(file) {
            const fileInfo = {file_url: file.file_url, name: frm.doc.name};
            frappe.call({
                method: "logistics.logistics.doctype.inbound.inbound.upload_file",
                args: {
                    data: fileInfo,
                    free_list: (frm.doc.items && frm.doc.items.length) ? JSON.stringify(frm.doc.items) : null
                },
                callback: function(response) {
                    const {message} = response;
                    if (message && Array.isArray(message[0])) {
                        message[0].forEach(item => {
                            if (item) {
                                const child = frm.add_child("items");
                                message[1].forEach(header => {
                                    if (item[header] !== undefined) {
                                        child[header] = item[header];
                                    }
                                });
                            }
                        });
                        frm.refresh_field("items");
                    }
                },
            });
        },
        make_attachments_public: true,
    });
}
