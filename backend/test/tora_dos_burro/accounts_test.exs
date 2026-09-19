defmodule ToraDosBurro.AccountsTest do
  use ToraDosBurro.DataCase, async: true

  alias ToraDosBurro.Accounts

  @valid_attrs %{
    "username" => "pedro",
    "email" => "pedro@example.com",
    "password" => "senha-super-segura"
  }

  describe "register_user/1" do
    test "cria o usuário com senha hasheada quando os dados são válidos" do
      assert {:ok, user} = Accounts.register_user(@valid_attrs)
      assert user.username == "pedro"
      assert user.email == "pedro@example.com"
      assert user.password_hash != nil
      assert user.password_hash != "senha-super-segura"
    end

    test "rejeita username duplicado" do
      assert {:ok, _user} = Accounts.register_user(@valid_attrs)

      assert {:error, changeset} =
               Accounts.register_user(%{@valid_attrs | "email" => "outro@example.com"})

      assert "has already been taken" in errors_on(changeset).username
    end

    test "rejeita senha curta" do
      assert {:error, changeset} =
               Accounts.register_user(%{@valid_attrs | "password" => "curta"})

      assert "should be at least 8 character(s)" in errors_on(changeset).password
    end
  end

  describe "authenticate_user/2" do
    setup do
      {:ok, user} = Accounts.register_user(@valid_attrs)
      %{user: user}
    end

    test "autentica com email e senha corretos", %{user: user} do
      assert {:ok, authenticated} = Accounts.authenticate_user(user.email, "senha-super-segura")
      assert authenticated.id == user.id
    end

    test "rejeita senha errada", %{user: user} do
      assert {:error, :unauthorized} = Accounts.authenticate_user(user.email, "senha-errada")
    end

    test "rejeita email inexistente" do
      assert {:error, :unauthorized} =
               Accounts.authenticate_user("ninguem@example.com", "qualquer-senha")
    end
  end
end
