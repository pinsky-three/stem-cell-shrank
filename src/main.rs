resource_model_macro::resource_model_file!("specs/self.yaml");

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = sqlx::PgPool::connect(&db_url).await?;

    migrate(&pool).await?;
    println!("migrations applied");

    let users = SqlxUserRepository::new(pool.clone());
    let posts = SqlxPostRepository::new(pool.clone());
    let _comments = SqlxCommentRepository::new(pool.clone());

    // ── Create ─────────────────────────────────────────────
    let email = format!("alice+{}@example.com", uuid::Uuid::new_v4());
    let alice = users
        .create(CreateUser {
            name: "Alice".into(),
            email,
            age: 20,
        })
        .await?;
    println!("created: {:?}", alice);

    let post = posts
        .create(CreatePost {
            title: "First post".into(),
            content: "Hello world".into(),
            user_id: alice.id,
        })
        .await?;
    println!("created: {:?}", post);

    // ── Read ───────────────────────────────────────────────
    let found = users.find_by_id(alice.id).await?;
    println!("find_by_id: {found:?}");

    let all_users = users.list().await?;
    println!("list: {} user(s)", all_users.len());

    // ── Update (partial — only title changes) ──────────────
    let updated = posts
        .update(
            post.id,
            UpdatePost {
                title: Some("Renamed".into()),
                content: None,
                user_id: None,
            },
        )
        .await?;
    println!("updated: {updated:?}");

    // ── Relations ──────────────────────────────────────────
    let alice_posts = users.owned_posts(alice.id).await?;
    println!("alice's posts: {}", alice_posts.len());

    let post_comments = posts.comments(post.id).await?;
    println!("post comments: {}", post_comments.len());

    // ── Delete ─────────────────────────────────────────────
    let removed = posts.delete(post.id).await?;
    println!("deleted post: {removed}");

    let removed = users.delete(alice.id).await?;
    println!("deleted user: {removed}");

    Ok(())
}
