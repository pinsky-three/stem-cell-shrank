mod codegen;
mod spec;
mod validate;

use proc_macro::TokenStream;
use syn::{parse_macro_input, LitStr};

/// Procedural macro that accepts a YAML string literal conforming to
/// the resource-model v1 spec and generates entity structs,
/// create/update DTOs, repository traits, and sqlx PgPool implementations.
#[proc_macro]
pub fn resource_model(input: TokenStream) -> TokenStream {
    let lit = parse_macro_input!(input as LitStr);
    let yaml_str = lit.value();

    let spec: spec::Spec = match serde_yaml::from_str(&yaml_str) {
        Ok(s) => s,
        Err(e) => {
            let msg = format!("resource_model!: failed to parse YAML: {e}");
            return quote::quote! { compile_error!(#msg); }.into();
        }
    };

    let errors = validate::validate(&spec);
    if !errors.is_empty() {
        let msgs: Vec<proc_macro2::TokenStream> = errors
            .iter()
            .map(|e| {
                let msg = format!("resource_model!: {e}");
                quote::quote! { compile_error!(#msg); }
            })
            .collect();
        return quote::quote! { #(#msgs)* }.into();
    }

    codegen::generate(&spec).into()
}
