// Copyright (c) 2025, Emeron Infospace and contributors
// For license information, please see license.txt


frappe.ui.form.on('Outbound', {
    refresh(frm) {
        frm.add_custom_button(__('Get Job Order'), function() {
            get_job_orders(frm);
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
            docstatus: 1
        };
        
        if (dialog.get_value('customer')) filters.customer = dialog.get_value('customer');
        if (dialog.get_value('supplier')) filters.supplier = dialog.get_value('supplier');
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
            console.log('Response:', r);
            if (r.message && r.message.length > 0) {
                let added_count = 0;
                let duplicate_count = 0;
                
                r.message.forEach(item => {
                    // consider duplicate if same reference_id (job order) and item_code already present
                    let item_exists = frm.doc.items.some(existing_item => 
                        (existing_item.reference_id === item.parent) &&
                        (existing_item.item_code === item.item_code)
                    );

                    if (!item_exists) {
                        let child = frm.add_child('items'); 
                        child.part_no = item.part_no || '';
                        child.qty = item.qty || 0;
                        child.item_code = item.item_code || '';
                        child.unit_price = item.unit_price || 0;
                        child.hs_code = item.hs_code || '';
                        child.unit_wt = item.unit_wt || 0;
                        child.gross_wt = item.gross_wt || 0;
                        child.coo = item.coo || '';
                        child.ref = item.ref || '';
                        child.description = item.description || '';
                        // set the Job Order name into reference_id field on the child
                        child.reference_id = item.parent || '';
                        added_count++;
                    } else {
                        duplicate_count++;
                    }
                });
                
                frm.refresh_field('items');
                
                if (added_count > 0 && duplicate_count > 0) {
                    frappe.show_alert({message: `${added_count} items added, ${duplicate_count} duplicates skipped`, indicator: 'blue'});
                } else if (added_count > 0) {
                    frappe.show_alert({message: `${added_count} items added`, indicator: 'green'});
                } else if (duplicate_count > 0) {
                    frappe.show_alert({message: `All items already exist`, indicator: 'orange'});
                }
            } else {
                frappe.show_alert({message: __('No items found for selected job orders'), indicator: 'yellow'});
            }
        },
        error(r) {
            frappe.show_alert({message: __('Error fetching items'), indicator: 'red'});
            console.error('Error:', r);
        }
    });
}