defmodule ToraDosBurro.AccountsTest do
  use ToraDosBurro.DataCase, async: true

  alias ToraDosBurro.Accounts

  @valid_attrs %{
    "username" => "pedro",
    "email" => "pedro@example.com",
    "password" => "senha-super-segura"
  }

  @no_email_attrs %{
    "username" => "pedro",
    "password" => "senha-super-segura"
  }

  describe "register_user/1" do
    test "cria o usuário com senha hasheada e discriminator atribuído quando os dados são válidos" do
      assert {:ok, user} = Accounts.register_user(@valid_attrs)
      assert user.username == "pedro"
      assert user.email == "pedro@example.com"
      assert user.password_hash != nil
      assert user.password_hash != "senha-super-segura"
      assert user.discriminator =~ ~r/^\d{4}$/
    end

    test "cria o usuário sem email — hoje só usuário+senha é obrigatório" do
      assert {:ok, user} = Accounts.register_user(@no_email_attrs)
      assert user.username == "pedro"
      assert user.email == nil
      assert user.discriminator =~ ~r/^\d{4}$/
    end

    test "permite o mesmo username com discriminators diferentes" do
      assert {:ok, user1} = Accounts.register_user(@no_email_attrs)
      assert {:ok, user2} = Accounts.register_user(@no_email_attrs)

      assert user1.username == user2.username
      assert user1.discriminator != user2.discriminator
    end

    test "rejeita email duplicado quando informado" do
      assert {:ok, _user} = Accounts.register_user(@valid_attrs)

      assert {:error, changeset} =
               Accounts.register_user(%{@valid_attrs | "username" => "outro_user"})

      assert "has already been taken" in errors_on(changeset).email
    end

    test "rejeita senha curta" do
      assert {:error, changeset} =
               Accounts.register_user(%{@no_email_attrs | "password" => "curta"})

      assert "should be at least 8 character(s)" in errors_on(changeset).password
    end
  end

  describe "authenticate_user/3" do
    setup do
      {:ok, user} = Accounts.register_user(@no_email_attrs)
      %{user: user}
    end

    test "autentica com username, discriminator e senha corretos", %{user: user} do
      assert {:ok, authenticated} =
               Accounts.authenticate_user(user.username, user.discriminator, "senha-super-segura")

      assert authenticated.id == user.id
    end

    test "rejeita senha errada", %{user: user} do
      assert {:error, :unauthorized} =
               Accounts.authenticate_user(user.username, user.discriminator, "senha-errada")
    end

    test "rejeita discriminator errado", %{user: user} do
      outro_discriminator = if user.discriminator == "0001", do: "0002", else: "0001"

      assert {:error, :unauthorized} =
               Accounts.authenticate_user(
                 user.username,
                 outro_discriminator,
                 "senha-super-segura"
               )
    end

    test "rejeita conta inexistente" do
      assert {:error, :unauthorized} =
               Accounts.authenticate_user("ninguem", "0001", "qualquer-senha")
    end
  end

  describe "authenticate_user/2 (sem discriminator)" do
    test "autentica direto quando só existe uma conta com esse username" do
      {:ok, user} = Accounts.register_user(@no_email_attrs)

      assert {:ok, authenticated} =
               Accounts.authenticate_user(user.username, "senha-super-segura")

      assert authenticated.id == user.id
    end

    test "rejeita senha errada" do
      {:ok, user} = Accounts.register_user(@no_email_attrs)

      assert {:error, :unauthorized} =
               Accounts.authenticate_user(user.username, "senha-errada")
    end

    test "rejeita conta inexistente" do
      assert {:error, :unauthorized} = Accounts.authenticate_user("ninguem", "qualquer-senha")
    end

    test "responde :ambiguous_username quando duas contas têm o mesmo nome, sem testar a senha contra nenhuma delas" do
      {:ok, _user1} = Accounts.register_user(@no_email_attrs)
      {:ok, _user2} = Accounts.register_user(@no_email_attrs)

      assert {:error, :ambiguous_username} =
               Accounts.authenticate_user("pedro", "senha-super-segura")
    end
  end
end
