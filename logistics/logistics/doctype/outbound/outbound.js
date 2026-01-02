// Copyright (c) 2025, Emeron Infospace and contributors
// For license information, please see license.txt


frappe.ui.form.on('Outbound', {
    refresh(frm) {
        if (frm.doc.docstatus == 0) {
            frm.add_custom_button(__('Get Job Order'), function() {
                get_job_orders(frm);
            });
        }
        
        // if (frm.doc.docstatus == 1) {
        //     frm.add_custom_button(__('Commercial Invoice'), function () {
        //         frappe.model.open_mapped_doc({
        //             method: "logistics.logistics.doctype.outbound.outbound.make_commercial_invoice",
        //             source_name: frm.doc.name
        //         });
        //     }, __('Create'));
        // }
    },
    
    terms: function(frm) {
        erpnext.utils.get_terms(frm.doc.terms, frm.doc, function(r) {
            if(!r.exc) {
                frm.set_value("terms_and_condition", r.message);
            }
        });
    }
});

function get_job_orders(frm) {
    let dialog = new frappe.ui.Dialog({
        title: __('Select Job Orders'),
        fields: [
            {
                fieldname: 'customer',
                label: __('Customer'),
                fieldtype: 'Link',
                options: 'Customer'
            },
            {
                fieldname: 'supplier',
                label: __('Supplier'),
                fieldtype: 'Link',
                options: 'Supplier'
            },
            {
                fieldname: 'column_break',
                label: __(''),
                fieldtype: 'Column Break'
            },
            {
                fieldname: 'from_date',
                label: __('From Date'),
                fieldtype: 'Date',
                default: frappe.datetime.add_days(frappe.datetime.get_today(), -30)
            },
            {
                fieldname: 'job_type',
                label: __('Job Type'),
                fieldtype: 'Select',
                options: '\nTransfer\nImport\nExport',
            },
            {
                fieldname: 'column_break1',
                label: __(''),
                fieldtype: 'Column Break'
            },
            {
                fieldname: 'to_date',
                label: __('To Date'),
                fieldtype: 'Date',
                default: frappe.datetime.get_today()
            },
            {
                fieldname: 'boe_no',
                label: __('BOE No'),
                fieldtype: 'Data'
            },
            {
                fieldname: 'section_break',
                label: __(''),
                fieldtype: 'Section Break'
            },
            {
                fieldname: 'job_orders',
                label: __('Job Orders'),
                fieldtype: 'Table',
                cannot_add_rows: true,
                cannot_delete_rows: true,
                data: [],
                fields: [
                    {
                        fieldname: 'posting_date',
                        label: __('Date'),
                        fieldtype: 'Date',
                        in_list_view: 1,
                        width: 100
                    },
                    {
                        fieldname: 'name',
                        label: __('Job Order ID'),
                        fieldtype: 'Link',
                        options: 'Job Order',
                        in_list_view: 1,
                        width: 150
                    },
                    {
                        fieldname: 'customer',
                        label: __('Customer'),
                        fieldtype: 'Link',
                        options: 'Customer',
                        in_list_view: 1,
                        width: 150
                    },
                    {
                        fieldname: 'total_qty',
                        label: __('Total Qty'),
                        fieldtype: 'Float',
                        in_list_view: 1,
                        width: 100
                    },
                    {
                        fieldname: 'total_value',
                        label: __('Total Value'),
                        fieldtype: 'Currency',
                        in_list_view: 1,
                        width: 120
                    },
                    {
                        fieldname: 'total_gross_wt',
                        label: __('Total Weight'),
                        fieldtype: 'Float',
                        in_list_view: 1,
                        width: 120
                    }
                ]
            }
        ],
        primary_action_label: __('Get Items'),
        size: 'extra-large',
        primary_action(values) {
            if (values.job_orders && values.job_orders.length > 0) {
                let selected_job_orders = values.job_orders.filter(row => row.__checked === 1);
                
                if (selected_job_orders.length === 0) {
                    frappe.show_alert({message: __('Please select at least one job order'), indicator: 'red'});
                    return;
                }
                
                fetch_and_add_items(frm, selected_job_orders, values);
            } else {
                frappe.show_alert({message: __('No job orders available'), indicator: 'red'});
            }
            dialog.hide();
        }
    });
    
    dialog.set_df_property('job_orders', 'cannot_add_rows', true);
    
    let refresh_job_orders = function() {
        let filters = {
            docstatus: 1,
            status: ['in', ['Pending', 'Partially']]
        };
        
        if (dialog.get_value('customer')) filters.customer = dialog.get_value('customer');
        if (dialog.get_value('supplier')) filters.supplier = dialog.get_value('supplier');
        if (dialog.get_value('job_type')) filters.job_type = dialog.get_value('job_type');
        if (dialog.get_value('boe_no')) filters.boe_no = dialog.get_value('boe_no');
        if (dialog.get_value('from_date')) filters.posting_date = ['>=', dialog.get_value('from_date')];
        if (dialog.get_value('to_date')) filters.posting_date = ['<=', dialog.get_value('to_date')];
        
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Job Order',
                fields: ['name', 'posting_date','customer', 'total_qty', 'total_value', 'total_gross_wt'],
                filters: filters,
                limit_page_length: 50
            },
            callback(r) {
                dialog.set_df_property('job_orders', 'data', r.message || []);
                dialog.refresh();
            }
        });
    };
    
    dialog.fields_dict.customer.df.onchange = refresh_job_orders;
    dialog.fields_dict.supplier.df.onchange = refresh_job_orders;
    dialog.fields_dict.from_date.df.onchange = refresh_job_orders;
    dialog.fields_dict.to_date.df.onchange = refresh_job_orders;
    dialog.fields_dict.job_type.df.onchange = refresh_job_orders;
    dialog.fields_dict.boe_no.df.onchange = refresh_job_orders;
    
    dialog.show();
    refresh_job_orders();
}

function fetch_and_add_items(frm, selected_rows, filters) {
    let job_order_names = selected_rows.map(row => row.name);
    console.log('Selected job orders:', job_order_names);
    
    frappe.call({
        method: 'logistics.logistics.doctype.outbound.outbound.get_job_order_items',
        args: {
            job_order: job_order_names,
        },
        callback(r) {
            if (r.message && r.message.length > 0) {
                let added_count = 0;
                let duplicate_count = 0;
                let zero_balance_count = 0;
                
                r.message.forEach(item => {
                    if (item.balance_qty <= 0) {
                        zero_balance_count++;
                        return;
                    }
                    let item_exists = frm.doc.items.some(existing_item => 
                        (existing_item.reference_id === item.parent) && 
                        (existing_item.item_code === item.item_code)
                    );
                    
                    if (!item_exists) {
                        let child = frm.add_child('items');
                        child.part_no = item.part_no || '';
                        child.qty = item.balance_qty || 0; 
                        child.item_code = item.item_code || '';
                        child.unit_price = item.unit_price || 0;
                        child.hs_code = item.hs_code || '';
                        child.unit_wt = item.unit_wt || 0;
                        child.gross_wt = (item.unit_wt * item.balance_qty) || 0; 
                        child.coo = item.coo || '';
                        child.ref = item.ref || '';
                        child.description = item.description || '';
                        child.reference_id = item.parent || '';
                        child.boe_no = item.boe_no || '';
                        child.order_item = item.name || '';
                        added_count++;
                    } else {
                        duplicate_count++;
                    }
                });
                
                frm.refresh_field('items');
                 calculate_totals(frm);
                
                let messages = [];
                if (added_count > 0) {
                    messages.push(`${added_count} items added`);
                }
                if (duplicate_count > 0) {
                    messages.push(`${duplicate_count} duplicates skipped`);
                }
                if (zero_balance_count > 0) {
                    messages.push(`${zero_balance_count} items fully consumed`);
                }
                
                if (messages.length > 0) {
                    let indicator = added_count > 0 ? 'green' : 'orange';
                    frappe.show_alert({
                        message: messages.join(', '),
                        indicator: indicator
                    });
                } else {
                    frappe.show_alert({
                        message: __('No items available to add'),
                        indicator: 'yellow'
                    });
                }
            } else {
                frappe.show_alert({
                    message: __('No items found for selected job orders'),
                    indicator: 'yellow'
                });
            }
        },
        error(r) {
            frappe.show_alert({
                message: __('Error fetching items'),
                indicator: 'red'
            });
            console.error('Error:', r);
        }
    });
}


frappe.ui.form.on("Outbound Item", {
	qty: function(frm, cdt, cdn) {
		calculate_item_total(frm, cdt, cdn);
	},
	unit_price: function(frm, cdt, cdn) {
		calculate_item_total(frm, cdt, cdn);
	},
    gross_wt: function(frm, cdt, cdn) {
        calculate_item_total(frm, cdt, cdn);
    },
    length: function(frm, cdt, cdn) {
        calculate_cbm(frm, cdt, cdn);
    },
    width: function(frm, cdt, cdn) {
        calculate_cbm(frm, cdt, cdn);
    },
    height: function(frm, cdt, cdn) {
        calculate_cbm(frm, cdt, cdn);
    },
});

function calculate_item_total(frm, cdt, cdn) {
	let row = locals[cdt][cdn];
	if (row.qty && row.unit_price) {
		row.total_value = row.qty * row.unit_price;
	}
    if (row.qty && row.gross_wt) {
		row.unit_wt = row.gross_wt / row.qty;
	}
	frm.refresh_field("items");
	calculate_totals(frm);
}

function calculate_totals(frm) {
    let total_qty = 0;
    let total_value = 0;
    let total_gross_wt = 0;
    
    frm.doc.items.forEach(item => {
        total_qty += flt(item.qty);
        total_value += flt(item.qty) * flt(item.unit_price);
        total_gross_wt += flt(item.gross_wt);
    });
    
    frm.set_value('total_qty', total_qty);
    frm.set_value('total_value', total_value);
    frm.set_value('total_gross_wt', total_gross_wt);
    
    frm.refresh_fields(['total_qty', 'total_value', 'total_gross_wt']);
}

function calculate_cbm(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    
    let l = flt(row.length);
    let w = flt(row.width);
    let h = flt(row.height);

    if (l > 0 && w > 0 && h > 0) {
        row.cbm = (l/100) * (w/100) * (h/100);
        frm.refresh_field("items");
}
    
    frm.refresh_field("items");
}