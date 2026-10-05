from httpx import AsyncClient


async def test_sante_repond_ok(client: AsyncClient) -> None:
    reponse = await client.get("/api/sante")

    assert reponse.status_code == 200
    assert reponse.json() == {"statut": "ok"}


async def test_sante_base_repond_ok(client: AsyncClient) -> None:
    reponse = await client.get("/api/sante/base")

    assert reponse.status_code == 200
    assert reponse.json() == {"statut": "ok"}
